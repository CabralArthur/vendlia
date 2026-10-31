/** Demo WhatsApp instances never talk to Evolution and never send messages. */
export const DEMO_INSTANCE_PREFIX = "demo-";
export const isDemoInstance = (name: string | null | undefined) => !!name && name.startsWith(DEMO_INSTANCE_PREFIX);
