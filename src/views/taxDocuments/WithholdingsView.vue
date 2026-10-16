<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';
import TaxDocumentTabs from '@/components/taxDocuments/TaxDocumentTabs.vue';
import TaxDocumentList from '@/components/taxDocuments/TaxDocumentList.vue';

const router = useRouter();
const auth = useAuthStore();
const canIssue = computed(() => auth.can('withholding:issue'));
</script>

<template>
  <v-container>
    <PageHeader :title="$t('taxDocuments.title')" :subtitle="$t('taxDocuments.withholdings.intro')">
      <template #actions>
        <v-btn v-if="canIssue" color="primary" prepend-icon="mdi-plus" @click="router.push({ name: 'tax-withholding-new' })">
          {{ $t('taxDocuments.withholdings.new') }}
        </v-btn>
      </template>
    </PageHeader>
    <TaxDocumentTabs />
    <TaxDocumentList document-type="07" />
  </v-container>
</template>
