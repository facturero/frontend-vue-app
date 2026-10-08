<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePluginCartStore } from '@/stores/pluginCart';
import type { CartQuoteItem } from '@/types/plugins';

const { t, te, locale } = useI18n();
const cart = usePluginCartStore();

const selected = computed(() => cart.quote?.items.filter((i) => i.kind === 'selected') ?? []);
const extras = computed(() => cart.quote?.items.filter((i) => i.kind !== 'selected') ?? []);
const currency = computed(() => cart.quote?.items[0]?.plugin.currency ?? 'USD');
const canConfirm = computed(() => selected.value.length > 0 && !cart.quote?.missing.length && !cart.quoting);

function formatPrice(cents: number): string {
  return new Intl.NumberFormat(locale.value, { style: 'currency', currency: currency.value }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(new Date(iso));
}

function priceOf(item: CartQuoteItem): string {
  return item.price === 0 ? t('plugins.included') : formatPrice(item.price);
}

/** Nombre del módulo elegido que arrastra a uno requerido. */
function requiredByName(item: CartQuoteItem): string {
  return cart.quote?.items.find((i) => i.plugin.code === item.required_by)?.plugin.name ?? item.required_by ?? '';
}

/** Mensaje del código rechazado: traducido si lo conocemos; si no, el que manda el servidor. */
function discountErrorText(error: { code: string; message: string }): string {
  const key = `plugins.discountErrors.${error.code}`;
  return te(key) ? t(key) : error.message;
}
</script>

<template>
  <v-dialog v-model="cart.open" max-width="640" scrollable>
    <v-card>
      <v-card-title>{{ $t('plugins.cart.title') }}</v-card-title>
      <v-progress-linear v-if="cart.quoting" indeterminate />

      <v-card-text>
        <v-alert v-if="cart.dropped.length" type="warning" class="mb-4">
          {{ $t('plugins.cart.dropped', { names: cart.dropped.join(', ') }) }}
        </v-alert>
        <v-alert v-if="cart.error" type="error" class="mb-4">{{ cart.error }}</v-alert>
        <v-alert v-if="cart.quote?.missing.length" type="error" class="mb-4">
          {{ $t('plugins.cart.missing', { names: cart.quote.missing.join(', ') }) }}
        </v-alert>

        <div v-if="!cart.count" class="text-center text-medium-emphasis pa-6">{{ $t('plugins.cart.empty') }}</div>

        <template v-else-if="cart.quote">
          <div class="text-subtitle-2 mb-2">{{ $t('plugins.cart.chosen') }}</div>
          <v-list class="mb-4">
            <v-list-item v-for="i in selected" :key="i.plugin.code">
              <v-list-item-title>{{ i.plugin.name }}</v-list-item-title>
              <template #append>
                <span class="text-body-2 mr-2">{{ priceOf(i) }}</span>
                <v-btn
                  icon="mdi-close"
                  size="x-small"
                  variant="text"
                  :title="$t('plugins.cart.remove')"
                  @click="cart.remove(i.plugin.code)"
                />
              </template>
            </v-list-item>
          </v-list>

          <template v-if="extras.length">
            <div class="text-subtitle-2 mb-2">{{ $t('plugins.cart.alsoIncluded') }}</div>
            <v-list class="mb-4">
              <v-list-item v-for="i in extras" :key="i.plugin.code">
                <v-list-item-title>{{ i.plugin.name }}</v-list-item-title>
                <v-list-item-subtitle v-if="i.kind === 'required'">
                  {{ $t('plugins.cart.requiredBy', { name: requiredByName(i) }) }}
                </v-list-item-subtitle>
                <template #append>
                  <v-chip v-if="i.kind === 'already_active'" size="x-small" color="primary" class="mr-2">
                    {{ $t('plugins.alreadyActive') }}
                  </v-chip>
                  <span v-else class="text-body-2">{{ priceOf(i) }}</span>
                </template>
              </v-list-item>
            </v-list>
          </template>

          <div class="d-flex align-start ga-2 mb-2">
            <v-text-field
              v-model="cart.discountInput"
              :label="$t('plugins.discountCode')"
              :disabled="Boolean(cart.quote.discount)"
              prepend-inner-icon="mdi-ticket-percent-outline"
              :error-messages="cart.quote.discount_error ? [discountErrorText(cart.quote.discount_error)] : []"
              @keyup.enter="cart.applyDiscount()"
            />
            <v-btn
              v-if="!cart.quote.discount"
              variant="tonal"
              :loading="cart.quoting"
              :disabled="!cart.discountInput.trim()"
              @click="cart.applyDiscount()"
            >
              {{ $t('plugins.discountApply') }}
            </v-btn>
            <v-btn v-else variant="text" @click="cart.removeDiscount()">{{ $t('plugins.discountRemove') }}</v-btn>
          </div>
          <v-alert v-if="cart.quote.discount" type="success" class="mb-2">
            {{ $t('plugins.discountApplied', {
              name: cart.quote.discount.name,
              amount: formatPrice(cart.quote.discount.discount_cents),
            }) }}
            <span v-if="cart.quote.discount.duration_months">
              {{ $t('plugins.discountDuration', { months: cart.quote.discount.duration_months }) }}
            </span>
          </v-alert>

          <div class="d-flex justify-end align-center ga-2">
            <span
              v-if="cart.quote.total_after_discount !== undefined"
              class="text-body-1 text-medium-emphasis text-decoration-line-through"
            >
              {{ formatPrice(cart.quote.total_monthly) }}
            </span>
            <span :class="cart.quote.total_with_vat === undefined ? 'text-h6' : 'text-body-1'">
              {{ $t('plugins.monthlySubtotal') }}
              {{ formatPrice(cart.quote.total_after_discount ?? cart.quote.total_monthly) }}
            </span>
          </div>
          <template v-if="cart.quote.total_with_vat !== undefined">
            <div class="d-flex justify-end text-body-2 text-medium-emphasis">
              {{ $t('plugins.vatLine', { percent: cart.quote.vat_percent }) }}
              {{ formatPrice(cart.quote.vat_cents ?? 0) }}
            </div>
            <div class="d-flex justify-end text-h6">
              {{ $t('plugins.monthlyTotal') }}
              {{ formatPrice(cart.quote.total_with_vat) }}
            </div>
            <v-alert v-if="cart.quote.trial?.active" type="success" icon="mdi-gift-outline" class="mt-3">
              {{ $t('plugins.trialQuote', {
                days: cart.quote.trial.days_left,
                date: formatDate(cart.quote.trial.ends_at),
              }) }}
            </v-alert>
          </template>
        </template>
      </v-card-text>

      <v-card-actions>
        <v-btn v-if="cart.count" variant="text" @click="cart.clear()">{{ $t('plugins.cart.clear') }}</v-btn>
        <v-spacer />
        <v-btn variant="text" @click="cart.open = false">{{ $t('common.cancel') }}</v-btn>
        <v-btn
          color="primary"
          variant="tonal"
          :disabled="!canConfirm"
          :loading="cart.activating"
          @click="cart.checkout()"
        >
          {{ $t('plugins.cart.confirm', { count: selected.length }) }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
