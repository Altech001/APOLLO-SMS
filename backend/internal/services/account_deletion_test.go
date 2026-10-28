package services

import "testing"

func TestValidateDeletionConfirmation(t *testing.T) {
	for _, value := range []string{"DELETE", " delete ", "Delete"} {
		if err := validateDeletionConfirmation(value); err != nil {
			t.Fatalf("confirmation %q was rejected: %v", value, err)
		}
	}
	if err := validateDeletionConfirmation("remove"); err == nil {
		t.Fatal("expected an invalid confirmation to fail")
	}
}

func TestManagedStorageKey(t *testing.T) {
	cases := map[string]string{
		"https://cdn.example.com/profile_images/12_photo.png":                 "profile_images/12_photo.png",
		"https://cdn.example.com/whatsapp-media/12/image.png?token=temporary": "whatsapp-media/12/image.png",
		"https://external.example.com/photo.png":                              "",
	}
	for input, want := range cases {
		if got := managedStorageKey(input); got != want {
			t.Fatalf("managedStorageKey(%q) = %q, want %q", input, got, want)
		}
	}
}
