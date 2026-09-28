package services

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"sync"
	"time"

	"backend/internal/models"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	_ "golang.org/x/image/webp"
	"google.golang.org/protobuf/proto"
)

const (
	whatsAppMediaTimeout  = 45 * time.Second
	whatsAppMaxImageBytes = 5 << 20
	whatsAppMediaCacheTTL = 6 * time.Hour
)

type cachedWhatsAppMedia struct {
	upload    whatsmeow.UploadResponse
	mimetype  string
	thumbnail []byte
	width     uint32
	height    uint32
	expires   time.Time
}

// whatsAppMediaCache keeps uploads per account and image, so a campaign uploads its banner once.
type whatsAppMediaCache struct {
	mu    sync.Mutex
	items map[string]cachedWhatsAppMedia
}

var mediaHTTPClient = &http.Client{Timeout: 30 * time.Second}

func (m *whatsAppSessionManager) buildMessage(ctx context.Context, sess *whatsAppSession, msg *models.WhatsAppMessage) (*waE2E.Message, error) {
	if msg.ImageURL == "" {
		return &waE2E.Message{Conversation: proto.String(msg.Body)}, nil
	}
	media, err := m.imageMedia(ctx, sess, msg.ImageURL)
	if err != nil {
		return nil, err
	}
	img := &waE2E.ImageMessage{
		URL:           proto.String(media.upload.URL),
		DirectPath:    proto.String(media.upload.DirectPath),
		MediaKey:      media.upload.MediaKey,
		Mimetype:      proto.String(media.mimetype),
		FileEncSHA256: media.upload.FileEncSHA256,
		FileSHA256:    media.upload.FileSHA256,
		FileLength:    proto.Uint64(media.upload.FileLength),
		JPEGThumbnail: media.thumbnail,
	}
	if media.width > 0 {
		img.Width, img.Height = proto.Uint32(media.width), proto.Uint32(media.height)
	}
	if msg.Body != "" {
		img.Caption = proto.String(msg.Body)
	}
	return &waE2E.Message{ImageMessage: img}, nil
}

func (m *whatsAppSessionManager) imageMedia(ctx context.Context, sess *whatsAppSession, imageURL string) (cachedWhatsAppMedia, error) {
	key := fmt.Sprintf("%d|%s", sess.accountID, imageURL)
	m.media.mu.Lock()
	cached, ok := m.media.items[key]
	m.media.mu.Unlock()
	if ok && time.Now().Before(cached.expires) {
		return cached, nil
	}

	data, err := downloadWhatsAppImage(ctx, imageURL)
	if err != nil {
		return cachedWhatsAppMedia{}, err
	}
	media := cachedWhatsAppMedia{mimetype: http.DetectContentType(data), expires: time.Now().Add(whatsAppMediaCacheTTL)}
	if decoded, _, err := image.Decode(bytes.NewReader(data)); err == nil {
		b := decoded.Bounds()
		media.width, media.height = uint32(b.Dx()), uint32(b.Dy())
		media.thumbnail = jpegThumbnail(decoded, 72)
		if media.mimetype == "image/webp" {
			var buf bytes.Buffer
			if jpeg.Encode(&buf, decoded, &jpeg.Options{Quality: 90}) == nil {
				data, media.mimetype = buf.Bytes(), "image/jpeg"
			}
		}
	}
	if media.mimetype != "image/jpeg" && media.mimetype != "image/png" {
		return cachedWhatsAppMedia{}, errors.New("the image must be a JPEG or PNG")
	}
	if media.upload, err = sess.client.Upload(ctx, data, whatsmeow.MediaImage); err != nil {
		return cachedWhatsAppMedia{}, fmt.Errorf("could not upload the image to WhatsApp: %w", err)
	}

	m.media.mu.Lock()
	if len(m.media.items) > 200 {
		m.media.items = map[string]cachedWhatsAppMedia{}
	}
	m.media.items[key] = media
	m.media.mu.Unlock()
	return media, nil
}

func downloadWhatsAppImage(ctx context.Context, imageURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imageURL, nil)
	if err != nil {
		return nil, errors.New("the image link is not valid")
	}
	resp, err := mediaHTTPClient.Do(req)
	if err != nil {
		return nil, errors.New("the image could not be downloaded")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("the image could not be downloaded (status %d)", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, whatsAppMaxImageBytes+1))
	if err != nil {
		return nil, errors.New("the image could not be downloaded")
	}
	if len(data) > whatsAppMaxImageBytes {
		return nil, errors.New("the image is larger than 5 MB")
	}
	return data, nil
}

// jpegThumbnail scales the image down (nearest neighbour is enough at this size) for the chat preview.
func jpegThumbnail(src image.Image, maxSide int) []byte {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w == 0 || h == 0 {
		return nil
	}
	tw, th := maxSide, maxSide
	if w > h {
		th = max(1, h*maxSide/w)
	} else {
		tw = max(1, w*maxSide/h)
	}
	dst := image.NewRGBA(image.Rect(0, 0, tw, th))
	for y := 0; y < th; y++ {
		for x := 0; x < tw; x++ {
			dst.Set(x, y, src.At(b.Min.X+x*w/tw, b.Min.Y+y*h/th))
		}
	}
	var buf bytes.Buffer
	if jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 60}) != nil {
		return nil
	}
	return buf.Bytes()
}
