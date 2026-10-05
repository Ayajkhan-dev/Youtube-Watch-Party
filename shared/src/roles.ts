// Roles ek hi jagah define hain, taaki client aur server dono same naam use karein.
export const ROLES = ['host', 'moderator', 'participant', 'viewer'] as const;
export type Role = (typeof ROLES)[number];
