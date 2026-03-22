-- Add ignored_at column to guild_members table
-- This allows guild officers to exclude members from planning

ALTER TABLE guild_members 
ADD COLUMN ignored_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add index for efficient filtering of ignored members
CREATE INDEX idx_guild_members_ignored_at 
ON guild_members(guild_id, ignored_at) 
WHERE ignored_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN guild_members.ignored_at IS 'Timestamp when member was ignored from planning. NULL means member is active.';