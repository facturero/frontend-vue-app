<template>
  <div>
    <PageHeader title="Comprobantes recibidos SRI" subtitle="Sincronización desde el portal del SRI" />

    <v-row>
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title class="text-title-large">Sincronización portal SRI</v-card-title>
          <v-card-text>
            <div class="mb-4">
              <v-chip :color="config.blockedBySri ? 'error' : config.enabled ? 'success' : 'default'" size="small" class="mb-2">
                {{ config.blockedBySri ? 'Bloqueado' : config.enabled ? 'Cron activado' : 'Cron desactivado' }}
              </v-chip>
              <div class="text-body-medium text-medium-emphasis">
                Última ejecución: {{ config.lastRunAt ? new Date(config.lastRunAt).toLocaleString() : 'Nunca' }}
              </div>
              <div v-if="config.lastStatus" class="text-body-medium">Estado: {{ config.lastStatus }}</div>
              <div v-if="config.lastError" class="text-body-medium text-error">{{ config.lastError }}</div>
              <v-alert v-if="config.blockedBySri" type="error" density="compact" class="mt-2">
                {{ config.blockedReason || 'Sincronización bloqueada por intentos fallidos.' }}
                <div class="mt-1">Guarda credenciales correctas para desbloquear.</div>
              </v-alert>
              <v-alert v-else-if="config.hasPassword && config.loginFailCount > 0" type="warning" density="compact" class="mt-2">
                Intentos fallidos: {{ config.loginFailCount }} / {{ config.maxAttempts }}. Te quedan {{ config.attemptsLeft }} intento(s) antes de bloquear la sincronización.
              </v-alert>
            </div>

            <v-form @submit.prevent="saveCreds">
              <v-text-field
                v-model="form.username"
                label="Usuario/RUC portal SRI"
                density="comfortable"
                variant="outlined"
                class="mb-2"
              />
              <v-text-field
                v-model="form.password"
                label="Contraseña"
                :type="showPass ? 'text' : 'password'"
                density="comfortable"
                variant="outlined"
                class="mb-2"
                :placeholder="config.hasPassword ? '********' : ''"
                :append-inner-icon="showPass ? 'mdi-eye-off' : 'mdi-eye'"
                @click:append-inner="showPass = !showPass"
              />
              <v-btn type="submit" color="primary" :loading="saving" class="mb-4">Guardar y probar credenciales</v-btn>
            </v-form>

            <div class="d-flex ga-2">
              <v-btn color="success" :disabled="!config.hasPassword || config.enabled || config.blockedBySri" :loading="toggling" @click="enable">
                Activar cron
              </v-btn>
              <v-btn color="warning" :disabled="!config.enabled" :loading="toggling" @click="disable">
                Desactivar cron
              </v-btn>
            </div>
            <v-alert v-if="msg" :type="msgType" density="compact" class="mt-3">{{ msg }}</v-alert>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import { purchasingApi } from '@/api/purchasing';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const config = reactive<any>({
  username: null,
  hasPassword: false,
  enabled: false,
  lastRunAt: null,
  lastStatus: null,
  lastError: null,
});

const form = reactive({
  username: '',
  password: '',
});

const saving = ref(false);
const toggling = ref(false);
const msg = ref('');
const msgType = ref<'success' | 'error' | 'warning'>('success');
const showPass = ref(false);

async function load() {
  try {
    const res = await purchasingApi.getSriPortalConfig();
    Object.assign(config, res);
    if (res.username) form.username = res.username;
  } catch (e) {
    console.error(e);
  }
}

async function saveCreds() {
  if (!form.username || !form.password) return;
  saving.value = true;
  msg.value = '';
  try {
    const res: any = await purchasingApi.saveSriPortalCredentials({ username: form.username, password: form.password });
    form.password = '';
    msg.value = res?.message || 'Credenciales guardadas correctamente.';
    msgType.value = 'success';
    await load();
  } catch (e: any) {
    const data = e?.response?.data;
    msg.value = data?.message || 'Error al guardar credenciales.';
    msgType.value = data?.code === 'SRI_PORTAL_BLOCKED' ? 'error' : 'warning';
    await load();
  } finally {
    saving.value = false;
  }
}

async function enable() {
  toggling.value = true;
  try {
    await purchasingApi.enableSriPortal();
    await load();
  } catch (e) {
    console.error(e);
  } finally {
    toggling.value = false;
  }
}

async function disable() {
  toggling.value = true;
  try {
    await purchasingApi.disableSriPortal();
    await load();
  } catch (e) {
    console.error(e);
  } finally {
    toggling.value = false;
  }
}

onMounted(load);
</script>
