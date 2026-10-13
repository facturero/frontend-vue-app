import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { getFiscalRegime } from '@/config/fiscalRegimes';
import { useOrganizationStore } from '@/stores/organization';
import { formatCents } from '@/utils/pos-totals';

/**
 * Formatea centavos con la moneda del régimen fiscal del país de la organización. El dólar se escribe «$12.50», como en la caja de
 * escritorio y como se ve en un precio de góndola en Ecuador (con el idioma español saldría «12,50 US$»); otras monedas siguen el idioma.
 */
export function usePosMoney() {
  const { locale } = useI18n();
  const org = useOrganizationStore();
  const currency = computed(() => getFiscalRegime(org.org?.countryCode).currencyCode);
  return { currency, money: (cents: number) => formatCents(cents, currency.value === 'USD' ? 'en-US' : locale.value, currency.value) };
}
