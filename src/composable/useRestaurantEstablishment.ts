import { computed, ref } from 'vue';
import { useOrganizationStore } from '@/stores/organization';
import { useRestaurantStore } from '@/stores/restaurant';

/**
 * Arranque común de las tres pantallas del plugin: elige el establecimiento
 * activo (recordando el último por usuario y organización) y devuelve sus
 * opciones para el selector. Una organización suele tener uno solo: en ese caso
 * el selector no se muestra y las pantallas ni lo mencionan.
 */
export function useRestaurantEstablishment() {
  const restaurant = useRestaurantStore();
  const organization = useOrganizationStore();
  const ready = ref(false);

  const activeEstablishments = computed(() => organization.establishments.filter((e) => e.status === 'active'));
  const establishmentOptions = computed(() =>
    organization.establishments.map((e) => ({ title: `${e.code} — ${e.name}`, value: e.id })),
  );
  const hasEstablishments = computed(() => activeEstablishments.value.length > 0);
  const showSelector = computed(() => activeEstablishments.value.length > 1);
  const establishmentId = computed(() => restaurant.selectedEstablishmentId);

  async function bootstrap(): Promise<void> {
    await organization.fetchEstablishments();
    restaurant.restoreEstablishment();
    const current =
      activeEstablishments.value.find((e) => e.id === restaurant.selectedEstablishmentId) ?? activeEstablishments.value[0];
    if (current) restaurant.selectEstablishment(current.id);
    else restaurant.selectedEstablishmentId = null;
    ready.value = true;
  }

  return { restaurant, organization, ready, establishmentId, establishmentOptions, hasEstablishments, showSelector, bootstrap };
}
