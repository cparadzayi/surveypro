-- Remove failed migration 058 from tracking table so it can be re-run
DELETE FROM migrations_history WHERE migration_name = '058.do.sql';
