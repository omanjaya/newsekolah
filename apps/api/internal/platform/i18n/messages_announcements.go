package i18n

func init() {
	catalog["ANNOUNCEMENT_NOT_FOUND"] = map[string]string{
		Indonesian: "Pengumuman tidak ditemukan.",
		English:    "Announcement not found.",
	}
	catalog["ANNOUNCEMENT_INVALID_STATUS"] = map[string]string{
		Indonesian: "Pengumuman tidak bisa diubah pada status saat ini.",
		English:    "The announcement cannot change in its current status.",
	}
	catalog["ANNOUNCEMENT_AUDIENCE_EMPTY"] = map[string]string{
		Indonesian: "Target penerima pengumuman tidak ditemukan.",
		English:    "The announcement's audience resolved to no recipients.",
	}
}
