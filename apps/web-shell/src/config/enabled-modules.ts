/** v0.1.6 (B2) — build-ийн `VITE_MODULES`-оос идэвхтэй модулиуд, нүүр зам (lib/modules.ts) */
import { AppModule, homePath, parseModules } from '../lib/modules';
import { feedEnabledFrom } from '../lib/home';

export const ENABLED_MODULES = parseModules(import.meta.env.VITE_MODULES as string | undefined);
export const HOME_PATH = homePath(ENABLED_MODULES);
export const isEnabled = (m: AppModule): boolean => ENABLED_MODULES.has(m);

/** v0.2.3 Блок 5 (M-0) — Feed: модулиас үл хамаарна; `VITE_FEED=off` бол унтраана */
export const FEED_ENABLED = feedEnabledFrom(import.meta.env.VITE_FEED as string | undefined);
