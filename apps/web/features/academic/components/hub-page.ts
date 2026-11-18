import type { AppPageProps } from "../../../components/app-page";

/**
 * The page frame a hub (Struktur sekolah, Pembelajaran) shares across its
 * sections: the description, its tabs and any switch in the toolbar. The
 * hub passes it to the section it shows, and the section renders the
 * AppPage itself, so the section's own "Tambah ..." is the header's
 * primary action (and a tool like "Pakai templat" a secondary one) in the
 * same place as on every other list page of Data sekolah, never a bar in
 * the table toolbar.
 */
export type HubPageProps = Pick<AppPageProps, "description" | "nav" | "toolbar">;
