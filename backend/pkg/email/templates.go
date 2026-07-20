package email

import (
	"bytes"
	"embed"
	"html/template"
)

//go:embed templates/*.html
var templatesFS embed.FS

// TemplateData holds variables passed to the HTML email templates.
type TemplateData struct {
	Name string
	URL  string
}

// ResetSuccessData holds variables for reset_success.html.
type ResetSuccessData struct {
	IPAddress    string
	Location     string
	CountryFlag  string
	ISP          string
	ConnectionTy string
	Device       string
	Time         string
}

// renderHTMLTemplate parses an embedded template and returns the executed string.
func renderHTMLTemplate(filename string, data interface{}) (string, error) {
	tmpl, err := template.ParseFS(templatesFS, "templates/"+filename)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", err
	}

	return buf.String(), nil
}

// GetVerificationTemplate returns a styled HTML body for email verification.
func GetVerificationTemplate(name, verifyURL string) (string, error) {
	return renderHTMLTemplate("verification.html", TemplateData{
		Name: name,
		URL:  verifyURL,
	})
}

// GetPasswordResetTemplate returns a styled HTML body for password resets.
func GetPasswordResetTemplate(name, resetURL string) (string, error) {
	return renderHTMLTemplate("password_reset.html", TemplateData{
		Name: name,
		URL:  resetURL,
	})
}

// GetVerifySuccessHTML returns the HTML for successful email verification.
func GetVerifySuccessHTML() (string, error) {
	return renderHTMLTemplate("verify_success.html", nil)
}

// GetVerifyFailedHTML returns the HTML for failed email verification.
func GetVerifyFailedHTML(errorMessage string) (string, error) {
	return renderHTMLTemplate("verify_failed.html", map[string]string{
		"Error": errorMessage,
	})
}

// GetResetFormHTML returns the HTML password reset form page.
func GetResetFormHTML(token string) (string, error) {
	return renderHTMLTemplate("reset_form.html", map[string]string{
		"Token": token,
	})
}

// GetResetSuccessHTML returns the HTML for a successful password reset.
func GetResetSuccessHTML(data ResetSuccessData) (string, error) {
	return renderHTMLTemplate("reset_success.html", data)
}

// GetResetFailedHTML returns the HTML for a failed password reset.
func GetResetFailedHTML(errorMessage string) (string, error) {
	return renderHTMLTemplate("reset_failed.html", map[string]string{
		"Error": errorMessage,
	})
}
