ALTER TABLE p04.invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE p04.invitations ADD CONSTRAINT invitations_role_check CHECK (role IN ('admin','member','viewer'));
