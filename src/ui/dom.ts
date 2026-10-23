import { itemDef, type ItemStack } from '../game/inventory/items';
import { itemIcon } from './icons';
import { fmtNum, t } from '../i18n/i18n';
import { trName, trText } from '../i18n/gameText';
import { describeItemL } from '../i18n/describe';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement | null, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export function button(parent: HTMLElement, label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = el('button', cls, parent, label);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
    b.blur();
  });
  return b;
}

const RARITY_EDGE: Record<string, string> = { common: '#4a3f30', uncommon: '#3f7a3a', rare: '#3a5fa8', legendary: '#b8701f' };

/** Fills an inventory-style slot element with an item icon (or a faint silhouette of what belongs there). */
export function paintSlot(slot: HTMLElement, stack: ItemStack | null, placeholderItem = ''): void {
  slot.replaceChildren();
  slot.classList.toggle('filled', !!stack);
  if (!stack) {
    slot.title = '';
    slot.style.borderColor = '';
    if (placeholderItem) {
      const ph = el('img', 'slot-img ph', slot);
      ph.src = itemIcon(placeholderItem);
      ph.alt = '';
      ph.draggable = false;
    }
    return;
  }
  const d = itemDef(stack.id);
  const img = el('img', 'slot-img', slot);
  img.src = itemIcon(stack.id);
  const name = trName(d.name);
  img.alt = name;
  img.draggable = false;
  if (stack.qty > 1 || d.stackable) el('span', 'slot-qty', slot, stack.qty >= 1000 ? `${Math.floor(stack.qty / 100) / 10}k` : String(stack.qty));
  slot.style.borderColor = RARITY_EDGE[d.rarity];
  slot.title = `${name}${stack.qty > 1 ? ` ×${fmtNum(stack.qty)}` : ''}\n${describeItemL(d)}${d.note ? `\n${trText(d.note)}` : ''}\n${t('Weight {w} oz', { w: Math.round(d.weight * stack.qty * 10) / 10 })}`;
}

export function fmtGold(n: number): string {
  return fmtNum(n, 0);
}
