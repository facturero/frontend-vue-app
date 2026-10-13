import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { getFiscalRegime } from '@/config/fiscalRegimes';
import { useOrganizationStore } from '@/stores/organization';
import { formatCents } from '@/utils/pos-totals';

/** Formatea centavos con la moneda y el idioma de quien vende (la moneda sale del régimen fiscal del país de la organización). */
export function usePosMoney() {
  const { locale } = useI18n();
  const org = useOrganizationStore();
  const currency = computed(() => getFiscalRegime(org.org?.countryCode).currencyCode);
  return { currency, money: (cents: number) => formatCents(cents, locale.value, currency.value) };
}
