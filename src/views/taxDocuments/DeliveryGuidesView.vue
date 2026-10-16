<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';
import TaxDocumentTabs from '@/components/taxDocuments/TaxDocumentTabs.vue';
import TaxDocumentList from '@/components/taxDocuments/TaxDocumentList.vue';

const router = useRouter();
const auth = useAuthStore();
const canIssue = computed(() => auth.can('delivery_guide:issue'));
</script>

<template>
  <v-container>
    <PageHeader :title="$t('taxDocuments.title')" :subtitle="$t('taxDocuments.guides.intro')">
      <template #actions>
        <v-btn v-if="canIssue" color="primary" prepend-icon="mdi-plus" @click="router.push({ name: 'tax-delivery-guide-new' })">
          {{ $t('taxDocuments.guides.new') }}
        </v-btn>
      </template>
    </PageHeader>
    <TaxDocumentTabs />
    <TaxDocumentList document-type="06" />
  </v-container>
</template>
