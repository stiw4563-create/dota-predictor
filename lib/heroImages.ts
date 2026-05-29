// Resolves hero portrait URL from a hero object.
// Steam CDN hosts these reliably; OpenDota mirrors them too.
import type { ODHero } from './types';

const STEAM = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes';

// "npc_dota_hero_anti_mage" → "anti_mage"
function shortName(npcName: string) {
  return npcName.replace(/^npc_dota_hero_/, '');
}

export function heroPortrait(hero: ODHero | undefined): string {
  if (!hero) return '';
  return `${STEAM}/${shortName(hero.name)}.png`;
}

export function heroById(heroes: ODHero[], id: number): ODHero | undefined {
  return heroes.find((h) => h.id === id);
}
