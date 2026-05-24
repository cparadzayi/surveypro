-- Rollback field book enhancements
DROP TABLE IF EXISTS stand_calculations CASCADE;
DROP TABLE IF EXISTS coordinate_list_enhanced CASCADE;
DROP TABLE IF EXISTS calculation_sheets_enhanced CASCADE;
DROP TABLE IF EXISTS field_book_entries CASCADE;
DROP TABLE IF EXISTS field_book_pages CASCADE;
DROP TABLE IF EXISTS electronic_field_books CASCADE;

DROP FUNCTION IF EXISTS organize_field_book_pages(INTEGER);
DROP FUNCTION IF EXISTS auto_create_field_book();
DROP TRIGGER IF EXISTS auto_create_field_book_trigger ON projects;