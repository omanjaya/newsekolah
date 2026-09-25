package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library"
	librarydomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	libraryservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// libraryMasterDataSeed is one row of a catalogue master-data table
// (material type, category, source, or location). Only material types use
// the loan-limit fields; the others leave them at zero.
type libraryMasterDataSeed struct {
	code, name                             string
	maxLoanItems, maxLoanDays, maxRenewals int
}

var libraryMaterialTypeSeeds = []libraryMasterDataSeed{
	{code: "BK", name: "Buku", maxLoanItems: 2, maxLoanDays: 7, maxRenewals: 1},
	{code: "MJ", name: "Majalah", maxLoanItems: 1, maxLoanDays: 3, maxRenewals: 0},
}

var libraryCategorySeeds = []libraryMasterDataSeed{
	// "fiksi" must stay lower-case: FictionRatioCounts (queries/reports_
	// catalogue.sql) matches the category code literally against 'fiksi',
	// not case-insensitively like the collection import does.
	{code: "fiksi", name: "Fiksi"},
	{code: "nonfiksi", name: "Non-Fiksi"},
	{code: "referensi", name: "Referensi"},
}

var libraryLocationSeeds = []libraryMasterDataSeed{
	{code: "RAK-A", name: "Rak Umum A"},
	{code: "RAK-R", name: "Rak Referensi"},
}

var librarySourceSeeds = []libraryMasterDataSeed{
	{code: "BELI", name: "Pembelian"},
}

// Default library member types come from librarydomain.MemberTypeDefaults
// so seed and a real tenant's bootstrap (migrator.EnsureTenantDefaults)
// never disagree.
var libraryMemberTypeSeeds = librarydomain.MemberTypeDefaults()

// libraryTitleSeed is one bibliography plus the master-data codes and copy
// count its copies are created with.
type libraryTitleSeed struct {
	title, author, publisher, isbn, issn, ddcNumber, classification string
	year, copies                                                    int
	materialTypeCode, categoryCode, locationCode, sourceCode        string
}

// ISBNs below use the unassigned "999" prefix (real ISBN-13s start with
// 978 or 979): this is demo catalogue data, not bibliographic records
// copied from an actual registry, and 999 can never collide with one.
var libraryTitleSeeds = []libraryTitleSeed{
	{
		title: "Laskar Pelangi", author: "Andrea Hirata", publisher: "Bentang Pustaka",
		isbn: "9990000000017", ddcNumber: "899.221", classification: "Fiksi - Novel Indonesia", year: 2005, copies: 2,
		materialTypeCode: "BK", categoryCode: "fiksi", locationCode: "RAK-A", sourceCode: "BELI",
	},
	{
		title: "Negeri 5 Menara", author: "A. Fuadi", publisher: "Gramedia Pustaka Utama",
		isbn: "9990000000024", ddcNumber: "899.221", classification: "Fiksi - Novel Indonesia", year: 2009, copies: 1,
		materialTypeCode: "BK", categoryCode: "fiksi", locationCode: "RAK-A", sourceCode: "BELI",
	},
	{
		title: "Sapiens: Riwayat Singkat Umat Manusia", author: "Yuval Noah Harari", publisher: "Kepustakaan Populer Gramedia",
		isbn: "9990000000031", ddcNumber: "909", classification: "Non-Fiksi - Sejarah Peradaban", year: 2017, copies: 1,
		materialTypeCode: "BK", categoryCode: "nonfiksi", locationCode: "RAK-R", sourceCode: "BELI",
	},
	{
		title: "Tempo", publisher: "Tempo Inti Media",
		isbn: "9990000000048", issn: "0126-4273", ddcNumber: "070", classification: "Non-Fiksi - Majalah Berita", year: 2026, copies: 2,
		materialTypeCode: "MJ", categoryCode: "nonfiksi", locationCode: "RAK-A", sourceCode: "BELI",
	},
}

// seedLibrary populates the library module so a fresh demo is usable
// straight away: master data, member types, the demo student and teacher
// registered as members, a small catalogue, and enough circulation
// activity that the dashboard and reports are not all zeros. Every step
// goes through the module's own service, the same way a librarian's own
// actions would, and is safe to re-run.
func seedLibrary(ctx context.Context, pool *pgxpool.Pool, tenantID uuid.UUID, users map[string]db.User, logger *slog.Logger) error {
	svc := library.Register(library.Dependencies{Pool: pool, Clock: clock.Real{}}).Service

	materialTypes, err := ensureMasterEntries(ctx, svc.ListMaterialTypes, svc.CreateMaterialType, tenantID, libraryMaterialTypeSeeds)
	if err != nil {
		return fmt.Errorf("seed material types: %w", err)
	}
	categories, err := ensureMasterEntries(ctx, svc.ListCollectionCategories, svc.CreateCollectionCategory, tenantID, libraryCategorySeeds)
	if err != nil {
		return fmt.Errorf("seed collection categories: %w", err)
	}
	locations, err := ensureMasterEntries(ctx, svc.ListLocations, svc.CreateLocation, tenantID, libraryLocationSeeds)
	if err != nil {
		return fmt.Errorf("seed locations: %w", err)
	}
	sources, err := ensureMasterEntries(ctx, svc.ListAcquisitionSources, svc.CreateAcquisitionSource, tenantID, librarySourceSeeds)
	if err != nil {
		return fmt.Errorf("seed acquisition sources: %w", err)
	}

	memberTypes, err := ensureLibraryMemberTypes(ctx, svc, tenantID)
	if err != nil {
		return fmt.Errorf("seed member types: %w", err)
	}
	if err := ensureLibraryMembers(ctx, svc, tenantID, users, memberTypes); err != nil {
		return fmt.Errorf("seed members: %w", err)
	}

	copiesByTitle, err := ensureLibraryCatalogue(ctx, svc, tenantID, materialTypes, categories, locations, sources)
	if err != nil {
		return fmt.Errorf("seed catalogue: %w", err)
	}

	if err := ensureLibraryActivity(ctx, svc, tenantID, users, copiesByTitle); err != nil {
		return fmt.Errorf("seed activity: %w", err)
	}

	logger.Info("library data ready", "titles", len(libraryTitleSeeds), "member_types", len(memberTypes))
	return nil
}

// ensureMasterEntries lists a catalogue master-data table and creates
// whatever seed row is missing by code, so the four kinds (material type,
// category, source, location) share one idempotent create-if-missing loop
// instead of four near-identical ones.
func ensureMasterEntries(
	ctx context.Context,
	list func(context.Context, uuid.UUID) ([]librarydomain.MasterEntry, error),
	create func(context.Context, librarydomain.MasterEntry) (librarydomain.MasterEntry, error),
	tenantID uuid.UUID, seeds []libraryMasterDataSeed,
) (map[string]librarydomain.MasterEntry, error) {
	existing, err := list(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list: %w", err)
	}
	byCode := make(map[string]librarydomain.MasterEntry, len(seeds))
	for _, e := range existing {
		byCode[e.Code] = e
	}
	for i, seed := range seeds {
		if _, ok := byCode[seed.code]; ok {
			continue
		}
		created, err := create(ctx, librarydomain.MasterEntry{
			TenantID: tenantID, Code: seed.code, Name: seed.name, IsActive: true, SortOrder: i,
			MaxLoanItems: seed.maxLoanItems, MaxLoanDays: seed.maxLoanDays, MaxRenewals: seed.maxRenewals,
		})
		if err != nil {
			return nil, fmt.Errorf("create %s: %w", seed.code, err)
		}
		byCode[seed.code] = created
	}
	return byCode, nil
}

func ensureLibraryMemberTypes(ctx context.Context, svc *libraryservice.Service, tenantID uuid.UUID) (map[string]librarydomain.MemberType, error) {
	existing, err := svc.ListMemberTypes(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list member types: %w", err)
	}
	byName := make(map[string]librarydomain.MemberType, len(existing))
	for _, t := range existing {
		byName[t.Name] = t
	}
	for _, seed := range libraryMemberTypeSeeds {
		if _, ok := byName[seed.Name]; ok {
			continue
		}
		created, err := svc.CreateMemberType(ctx, tenantID, librarydomain.MemberType{
			Name: seed.Name, MaxLoanItems: seed.MaxLoanItems, MaxLoanDays: seed.MaxLoanDays,
			RenewalDays: seed.RenewalDays, MaxRenewals: seed.MaxRenewals, FineType: librarydomain.FineConstant,
			FinePerTenor: 500, TenorDays: 1, SuspendDays: seed.SuspendDays, ValidityMonths: seed.ValidityMonths,
			DefaultForRole: seed.DefaultForRole,
		})
		if err != nil {
			return nil, fmt.Errorf("create member type %s: %w", seed.Name, err)
		}
		byName[seed.Name] = created
	}
	return byName, nil
}

// ensureLibraryMembers registers the demo student and teacher as library
// members under their role's member type, unless they already are one.
func ensureLibraryMembers(ctx context.Context, svc *libraryservice.Service, tenantID uuid.UUID, users map[string]db.User, memberTypes map[string]librarydomain.MemberType) error {
	registrations := []struct{ username, memberTypeName string }{
		{"siswa", "Siswa"},
		{"siswa2", "Siswa"},
		{"guru", "Guru & Staf"},
	}
	for _, r := range registrations {
		user, ok := users[r.username]
		if !ok {
			continue
		}
		_, err := svc.GetMember(ctx, tenantID, user.ID)
		if err == nil {
			continue
		}
		if !errors.Is(err, librarydomain.ErrMemberNotFound) {
			return fmt.Errorf("lookup member %s: %w", r.username, err)
		}
		memberType, ok := memberTypes[r.memberTypeName]
		if !ok {
			return fmt.Errorf("member type %q not seeded", r.memberTypeName)
		}
		if _, err := svc.RegisterMember(ctx, tenantID, libraryservice.RegisterMemberInput{
			UserID: user.ID, MemberTypeID: memberType.ID,
		}); err != nil {
			return fmt.Errorf("register member %s: %w", r.username, err)
		}
	}
	return nil
}

// ensureLibraryCatalogue creates every seed title that isn't already on
// file (matched by ISBN) and returns each title's copies, whether they
// were just created or already existed, so the caller can seed loans
// against them.
func ensureLibraryCatalogue(
	ctx context.Context, svc *libraryservice.Service, tenantID uuid.UUID,
	materialTypes, categories, locations, sources map[string]librarydomain.MasterEntry,
) (map[string][]librarydomain.Copy, error) {
	copiesByTitle := make(map[string][]librarydomain.Copy, len(libraryTitleSeeds))
	for _, seed := range libraryTitleSeeds {
		existing, found, err := svc.LookupTitleByISBN(ctx, tenantID, seed.isbn)
		if err != nil {
			return nil, fmt.Errorf("lookup title %s: %w", seed.title, err)
		}
		if found {
			copies, err := svc.ListCopies(ctx, tenantID, existing.ID)
			if err != nil {
				return nil, fmt.Errorf("list copies for %s: %w", seed.title, err)
			}
			copiesByTitle[seed.title] = copies
			continue
		}

		materialType, ok := materialTypes[seed.materialTypeCode]
		if !ok {
			return nil, fmt.Errorf("material type %q not seeded", seed.materialTypeCode)
		}
		category, ok := categories[seed.categoryCode]
		if !ok {
			return nil, fmt.Errorf("category %q not seeded", seed.categoryCode)
		}
		location, ok := locations[seed.locationCode]
		if !ok {
			return nil, fmt.Errorf("location %q not seeded", seed.locationCode)
		}
		source, ok := sources[seed.sourceCode]
		if !ok {
			return nil, fmt.Errorf("source %q not seeded", seed.sourceCode)
		}

		title := librarydomain.Title{
			TenantID: tenantID, Title: seed.title, Author: seed.author, Publisher: seed.publisher,
			PublishYear: seed.year, ISBN: seed.isbn, ISSN: seed.issn, DDCNumber: seed.ddcNumber,
			Classification: seed.classification, IsOPAC: true,
			MaterialTypeID: uuid.NullUUID{UUID: materialType.ID, Valid: true},
		}
		defaults := libraryservice.CopyDefaults{
			CategoryID: uuid.NullUUID{UUID: category.ID, Valid: true},
			LocationID: uuid.NullUUID{UUID: location.ID, Valid: true},
			SourceID:   uuid.NullUUID{UUID: source.ID, Valid: true},
			IsOPAC:     true,
		}
		_, copies, err := svc.CreateTitle(ctx, title, seed.copies, defaults)
		if err != nil {
			return nil, fmt.Errorf("create title %s: %w", seed.title, err)
		}
		copiesByTitle[seed.title] = copies
	}
	return copiesByTitle, nil
}

// ensureLibraryActivity gives the demo one loan still out (the student
// borrowing "Laskar Pelangi"), one loan already returned (the teacher
// borrowing and returning "Negeri 5 Menara"), and a visit for each of
// them, so the dashboard and reports have something to show.
func ensureLibraryActivity(ctx context.Context, svc *libraryservice.Service, tenantID uuid.UUID, users map[string]db.User, copiesByTitle map[string][]librarydomain.Copy) error {
	admin, student, teacher := users["admin"], users["siswa"], users["guru"]

	if err := ensureDemoLoan(ctx, svc, tenantID, student.ID, admin.ID, copiesByTitle["Laskar Pelangi"], false); err != nil {
		return fmt.Errorf("active loan: %w", err)
	}
	if err := ensureDemoLoan(ctx, svc, tenantID, teacher.ID, admin.ID, copiesByTitle["Negeri 5 Menara"], true); err != nil {
		return fmt.Errorf("returned loan: %w", err)
	}
	// "Sapiens" has a single copy; checking it out and never returning it
	// leaves zero copies available, which is what Service.Reserve requires
	// (ErrCopyAvailableForLoan otherwise) -- the multi-actor simulation's
	// library scenario (apps/web/e2e/simulation) needs one title a student
	// can actually reserve.
	if err := ensureDemoLoan(ctx, svc, tenantID, teacher.ID, admin.ID, copiesByTitle["Sapiens: Riwayat Singkat Umat Manusia"], false); err != nil {
		return fmt.Errorf("fully checked out loan: %w", err)
	}

	for _, v := range []db.User{student, teacher} {
		if v.ID == uuid.Nil {
			continue
		}
		if _, err := svc.RecordVisit(ctx, tenantID, libraryservice.RecordVisitInput{
			MemberUserID: uuid.NullUUID{UUID: v.ID, Valid: true}, Kind: librarydomain.VisitMember,
			Purpose: "Membaca dan meminjam buku", Source: librarydomain.VisitSourceManual,
			CreatedBy: uuid.NullUUID{UUID: admin.ID, Valid: true},
		}); err != nil {
			return fmt.Errorf("record visit for %s: %w", v.Username, err)
		}
	}
	return nil
}

// ensureDemoLoan borrows the first available copy in copies for memberID,
// returning it immediately when returnImmediately is set. Borrow itself
// has no idempotency guard, so this first checks the member's loan
// history for any of copies' IDs and does nothing once one is found --
// otherwise a second seed run would check the same copy out again.
func ensureDemoLoan(ctx context.Context, svc *libraryservice.Service, tenantID, memberID, actorID uuid.UUID, copies []librarydomain.Copy, returnImmediately bool) error {
	if memberID == uuid.Nil || len(copies) == 0 {
		return nil
	}
	history, err := svc.MemberLoanHistory(ctx, tenantID, memberID, true, 200, 0)
	if err != nil {
		return fmt.Errorf("list loan history: %w", err)
	}
	borrowed := make(map[uuid.UUID]bool, len(history))
	for _, l := range history {
		borrowed[l.CopyID] = true
	}
	var target librarydomain.Copy
	for _, c := range copies {
		if borrowed[c.ID] {
			return nil
		}
		if target.ID == uuid.Nil && c.Status == librarydomain.CopyAvailable {
			target = c
		}
	}
	if target.ID == uuid.Nil {
		return nil
	}

	loan, err := svc.Borrow(ctx, tenantID, libraryservice.BorrowInput{
		Barcode: target.Barcode, MemberUserID: memberID, CheckedOutBy: actorID, Channel: librarydomain.ChannelDesk,
	})
	if err != nil {
		return fmt.Errorf("borrow %s: %w", target.Barcode, err)
	}
	if !returnImmediately {
		return nil
	}
	if _, err := svc.Return(ctx, tenantID, libraryservice.ReturnInput{
		LoanID: uuid.NullUUID{UUID: loan.ID, Valid: true}, CheckedInBy: actorID,
	}); err != nil {
		return fmt.Errorf("return %s: %w", target.Barcode, err)
	}
	return nil
}
