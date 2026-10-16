-- v1.2 cleanup: Mark drop saves the tapped position as-is, so the reaction offset setting is gone.
-- Run after the code that stops reading this column is deployed.
alter table settings drop column reaction_offset_ms;
