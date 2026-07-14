package com.equimaps.capacitor_background_geolocation;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import com.getcapacitor.Logger;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationAvailability;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import androidx.localbroadcastmanager.content.LocalBroadcastManager;

// A bound and started service that is promoted to a foreground service
// (showing a persistent notification) when the first background watcher is
// added, and demoted when the last background watcher is removed.
public class BackgroundGeolocationService extends Service {
    static final String ACTION_BROADCAST = (
            BackgroundGeolocationService.class.getPackage().getName() + ".broadcast"
    );
    private final IBinder binder = new LocalBinder();

    // Must be unique for this application.
    private static final int NOTIFICATION_ID = 28351;

    private class Watcher {
        public String id;
        public FusedLocationProviderClient client;
        public LocationRequest locationRequest;
        public LocationCallback locationCallback;
        public Notification backgroundNotification;
    }
    private HashSet<Watcher> watchers = new HashSet<Watcher>();

    // [DPL] Alarme de reforço: em alguns fabricantes (Xiaomi/MIUI confirmado
    // em campo), o Android segura as entregas do requestLocationUpdates()
    // contínuo pra um app em segundo plano mesmo com o serviço em primeiro
    // plano ativo (a notificação continua visível, mas a localização não
    // chega). setAndAllowWhileIdle() acorda o app mesmo durante Doze/economia
    // de bateria SEM exigir a permissão especial "Alarmes e lembretes"
    // (diferente da versão "Exact", que no Android 13+ exige o usuário
    // liberar manualmente mais uma tela) — o horário pode atrasar um pouco
    // em troca disso, o que não é problema pra uma rede de segurança que já
    // roda a cada minuto.
    private static final long INTERVALO_ALARME_MS = 60 * 1000; // 1 minuto
    private static final int ALARME_REQUEST_CODE = 93821;
    private static final String ACTION_ALARME_REFORCO = (
            BackgroundGeolocationService.class.getPackage().getName() + ".alarme_reforco"
    );

    private AlarmManager alarmManager;
    private PendingIntent alarmPendingIntent;
    private BroadcastReceiver alarmReceiver;
    private Handler heartbeatHandler;
    private boolean heartbeatRodando = false;
    private final Runnable heartbeatRunnable = new Runnable() {
        @Override
        public void run() {
            capturarLocalizacaoPontual();
            if (heartbeatHandler != null && heartbeatRodando) {
                heartbeatHandler.postDelayed(this, INTERVALO_ALARME_MS);
            }
        }
    };

    // [DPL] Envio nativo direto pro Supabase (sem depender da ponte JS/WebView
    // estar rodando) + fila offline própria em arquivo local — mesma ideia da
    // fila em IndexedDB que já existe no lado JS (rastreio.js), só que
    // reimplementada em Java porque o WebView não é acessível daqui.
    // Debounce fixo de 8s pro stream contínuo (que entrega posições a cada
    // ~1s) — o alarme de reforço (1min) cobre o caso do stream ficar represado.
    private static final long CADENCIA_GRAVACAO_MS = 8000;
    private static final long CADENCIA_PRESENCA_MS = 60 * 1000;
    private static final String PREFS_NOME = "rastreio_config_nativo";
    private long ultimaGravacaoMs = 0;
    private long ultimaPresencaMs = 0;
    private Location ultimaLocalizacaoConhecida = null;
    private ExecutorService filaExecutor;

    @Override
    public void onCreate() {
        super.onCreate();
        filaExecutor = Executors.newSingleThreadExecutor();
        heartbeatHandler = new Handler(Looper.getMainLooper());
        alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        Intent alarmIntent = new Intent(ACTION_ALARME_REFORCO).setPackage(getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        alarmPendingIntent = PendingIntent.getBroadcast(this, ALARME_REQUEST_CODE, alarmIntent, flags);
        alarmReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                capturarLocalizacaoPontual();
                agendarProximoAlarme();
            }
        };
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(alarmReceiver, new IntentFilter(ACTION_ALARME_REFORCO), Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(alarmReceiver, new IntentFilter(ACTION_ALARME_REFORCO));
        }
    }

    @Override
    public void onDestroy() {
        pararHeartbeatEmProcesso();
        if (alarmManager != null && alarmPendingIntent != null) {
            alarmManager.cancel(alarmPendingIntent);
        }
        if (alarmReceiver != null) {
            try { unregisterReceiver(alarmReceiver); } catch (Exception ignore) {}
        }
        if (filaExecutor != null) filaExecutor.shutdown();
        super.onDestroy();
    }

    private void agendarProximoAlarme() {
        if (alarmManager == null || alarmPendingIntent == null) return;
        try {
            alarmManager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    System.currentTimeMillis() + INTERVALO_ALARME_MS,
                    alarmPendingIntent
            );
        } catch (Exception e) {
            Logger.error("Falha ao agendar alarme de reforço", e);
        }
    }

    // Pede uma localização pontual (não o stream contínuo) e entrega pra
    // cada watcher ativo pelo mesmo canal (ACTION_BROADCAST) que o fluxo
    // normal usa — assim reaproveita o mesmo caminho já testado até o JS,
    // sem precisar mexer no lado do plugin (BackgroundGeolocation.java).
    private void iniciarHeartbeatEmProcesso() {
        if (heartbeatHandler == null) {
            heartbeatHandler = new Handler(Looper.getMainLooper());
        }
        if (heartbeatRodando) return;
        heartbeatRodando = true;
        heartbeatHandler.removeCallbacks(heartbeatRunnable);
        heartbeatHandler.postDelayed(heartbeatRunnable, INTERVALO_ALARME_MS);
    }

    private void pararHeartbeatEmProcesso() {
        heartbeatRodando = false;
        if (heartbeatHandler != null) {
            heartbeatHandler.removeCallbacks(heartbeatRunnable);
        }
    }

    private void capturarLocalizacaoPontual() {
        if (watchers.isEmpty()) return;
        FusedLocationProviderClient client = LocationServices.getFusedLocationProviderClient(this);
        try {
            client.getCurrentLocation(LocationRequest.PRIORITY_HIGH_ACCURACY, null)
                    .addOnSuccessListener(location -> {
                        if (location == null) {
                            gravarBatimentoComUltimaLocalizacao(client);
                            return;
                        }
                        for (Watcher watcher : watchers) {
                            Intent intent = new Intent(ACTION_BROADCAST);
                            intent.putExtra("location", location);
                            intent.putExtra("id", watcher.id);
                            LocalBroadcastManager.getInstance(getApplicationContext()).sendBroadcast(intent);
                        }
                        gravarLocalizacaoNativa(location, true);
                    })
                    .addOnFailureListener(e -> gravarBatimentoComUltimaLocalizacao(client));
        } catch (SecurityException ignore) {}
    }

    // ─── Envio nativo direto pro Supabase + fila offline (arquivo local) ───

    private void gravarBatimentoComUltimaLocalizacao(FusedLocationProviderClient client) {
        if (ultimaLocalizacaoConhecida != null) {
            gravarLocalizacaoNativa(ultimaLocalizacaoConhecida, true);
            return;
        }
        try {
            client.getLastLocation()
                    .addOnSuccessListener(location -> {
                        if (location != null) {
                            gravarLocalizacaoNativa(location, true);
                        }
                    });
        } catch (SecurityException ignore) {}
    }

    void configurarSupabase(String url, String anonKey, String schema, String fiscalLogin, String fiscalNome) {
        getSharedPreferences(PREFS_NOME, Context.MODE_PRIVATE).edit()
                .putString("url", url)
                .putString("anonKey", anonKey)
                .putString("schema", schema == null ? "dev" : schema)
                .putString("fiscalLogin", fiscalLogin)
                .putString("fiscalNome", fiscalNome)
                .apply();
    }

    private boolean configuradoParaGravar() {
        SharedPreferences p = getSharedPreferences(PREFS_NOME, Context.MODE_PRIVATE);
        return p.contains("url") && p.contains("anonKey") && p.contains("fiscalLogin");
    }

    // Aplica o mesmo debounce que antes vivia só no JS (rastreio.js) — o
    // stream contínuo entrega posições a cada ~1s, e não faz sentido gravar
    // todas. Chamado tanto pelo watcher contínuo quanto pelo alarme de reforço.
    private void gravarLocalizacaoNativa(Location location) {
        gravarLocalizacaoNativa(location, false);
    }

    private void gravarLocalizacaoNativa(Location location, boolean forcarTrilha) {
        if (!configuradoParaGravar()) return; // login ainda não configurou (primeira execução)
        if (location == null) return;
        ultimaLocalizacaoConhecida = location;
        atualizarPresencaNativa(location, forcarTrilha);
        long agora = System.currentTimeMillis();
        if (!forcarTrilha && agora - ultimaGravacaoMs < CADENCIA_GRAVACAO_MS) return;
        ultimaGravacaoMs = agora;

        final double lat = location.getLatitude();
        final double lng = location.getLongitude();
        final Float precisao = location.hasAccuracy() ? location.getAccuracy() : null;

        filaExecutor.execute(() -> {
            SharedPreferences p = getSharedPreferences(PREFS_NOME, Context.MODE_PRIVATE);
            String fiscalLogin = p.getString("fiscalLogin", "");
            String fiscalNome = p.getString("fiscalNome", "");
            String agoraISO = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(new Date());

            try {
                JSONObject registro = new JSONObject();
                registro.put("fiscal_login", fiscalLogin);
                registro.put("fiscal_nome", fiscalNome);
                registro.put("lat", lat);
                registro.put("lng", lng);
                registro.put("precisao", precisao == null ? JSONObject.NULL : precisao);
                registro.put("created_at", agoraISO);

                if (!enviarParaSupabase("localizacoes", registro, "return=minimal")) {
                    enfileirarNativo(registro);
                }
                drenarFilaNativa();

                // Heartbeat de presença — best-effort, sem fila (igual ao lado JS:
                // se falhar, a próxima captura corrige o "último visto" sozinha).
                JSONObject presenca = new JSONObject();
                presenca.put("fiscal_login", fiscalLogin);
                presenca.put("fiscal_nome", fiscalNome);
                presenca.put("lat", lat);
                presenca.put("lng", lng);
                presenca.put("precisao", precisao == null ? JSONObject.NULL : precisao);
                presenca.put("ultimo_visto", agoraISO);
                enviarParaSupabase("fiscais_presenca?on_conflict=fiscal_login", presenca, "resolution=merge-duplicates,return=minimal");
            } catch (Exception e) {
                Logger.error("Falha ao gravar localização nativa", e);
            }
        });
    }

    // Heartbeat de presenca separado da gravacao de trilha. Quando o Android
    // mantem o servico ativo, mas nao entrega nova coordenada porque o fiscal
    // esta parado, renovamos o "ultimo_visto" com a ultima posicao conhecida.
    // Isso evita o fiscal ficar cinza no mapa enquanto o app segue rastreando.
    private void atualizarPresencaNativa(Location location, boolean forcar) {
        if (!configuradoParaGravar() || location == null || filaExecutor == null) return;
        long agora = System.currentTimeMillis();
        if (!forcar && agora - ultimaPresencaMs < CADENCIA_PRESENCA_MS) return;
        ultimaPresencaMs = agora;

        final double lat = location.getLatitude();
        final double lng = location.getLongitude();
        final Float precisao = location.hasAccuracy() ? location.getAccuracy() : null;

        filaExecutor.execute(() -> {
            SharedPreferences p = getSharedPreferences(PREFS_NOME, Context.MODE_PRIVATE);
            String fiscalLogin = p.getString("fiscalLogin", "");
            String fiscalNome = p.getString("fiscalNome", "");
            String agoraISO = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(new Date());

            try {
                JSONObject presenca = new JSONObject();
                presenca.put("fiscal_login", fiscalLogin);
                presenca.put("fiscal_nome", fiscalNome);
                presenca.put("lat", lat);
                presenca.put("lng", lng);
                presenca.put("precisao", precisao == null ? JSONObject.NULL : precisao);
                presenca.put("ultimo_visto", agoraISO);
                enviarParaSupabase("fiscais_presenca?on_conflict=fiscal_login", presenca, "resolution=merge-duplicates,return=minimal");
            } catch (Exception e) {
                Logger.error("Falha ao atualizar presenca nativa", e);
            }
        });
    }

    // Faz o POST pro endpoint REST do Supabase (PostgREST). "caminho" pode
    // incluir query string (ex: "fiscais_presenca?on_conflict=fiscal_login").
    // Roda sempre dentro de filaExecutor (thread de fundo) — nunca chamar da
    // main thread.
    private boolean enviarParaSupabase(String caminho, JSONObject registro, String preferHeader) {
        SharedPreferences p = getSharedPreferences(PREFS_NOME, Context.MODE_PRIVATE);
        String url = p.getString("url", null);
        String anonKey = p.getString("anonKey", null);
        String schema = p.getString("schema", "dev");
        if (url == null || anonKey == null) return false;

        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url + "/rest/v1/" + caminho).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("apikey", anonKey);
            conn.setRequestProperty("Authorization", "Bearer " + anonKey);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Content-Profile", schema);
            conn.setRequestProperty("Prefer", preferHeader);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(registro.toString().getBytes(StandardCharsets.UTF_8));
            }
            int codigo = conn.getResponseCode();
            return codigo >= 200 && codigo < 300;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private File arquivoFilaNativa() {
        return new File(getFilesDir(), "rastreio_fila_nativa.jsonl");
    }

    private synchronized void enfileirarNativo(JSONObject registro) {
        try (FileWriter fw = new FileWriter(arquivoFilaNativa(), true)) {
            fw.write(registro.toString() + "\n");
        } catch (Exception e) {
            Logger.error("Falha ao enfileirar localização offline (nativo)", e);
        }
    }

    // Tenta reenviar tudo que ficou preso (sem internet, etc). Reescreve o
    // arquivo só com o que ainda falhou — igual ao drenarFila() do lado JS.
    private synchronized void drenarFilaNativa() {
        File arquivo = arquivoFilaNativa();
        if (!arquivo.exists()) return;

        List<String> pendentes = new ArrayList<>();
        try (BufferedReader br = new BufferedReader(new FileReader(arquivo))) {
            String linha;
            while ((linha = br.readLine()) != null) {
                if (linha.trim().isEmpty()) continue;
                try {
                    JSONObject registro = new JSONObject(linha);
                    if (!enviarParaSupabase("localizacoes", registro, "return=minimal")) {
                        pendentes.add(linha);
                    }
                } catch (Exception e) {
                    // linha corrompida — descarta em vez de travar a fila pra sempre
                }
            }
        } catch (Exception e) {
            Logger.error("Falha ao ler fila offline nativa", e);
            return;
        }

        try {
            if (pendentes.isEmpty()) {
                arquivo.delete();
            } else {
                try (FileWriter fw = new FileWriter(arquivo, false)) {
                    for (String linha : pendentes) fw.write(linha + "\n");
                }
            }
        } catch (Exception e) {
            Logger.error("Falha ao reescrever fila offline nativa", e);
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    // [DPL] Agora o serviço também é iniciado de forma independente
    // (startForegroundService, ver BackgroundGeolocation.addWatcher()), não
    // só vinculado — por isso perder o bind (Activity destruída pelo Android)
    // não deve mais interromper os watchers de localização ativos. Antes,
    // esse teardown agressivo era necessário porque o serviço só existia
    // enquanto vinculado; hoje ele é o motivo dos "buracos" de horas sem
    // localização em campo. O rastreio só para de verdade via removeWatcher()
    // (chamado no logout, em rastreio.js).
    @Override
    public boolean onUnbind(Intent intent) {
        return true; // permite onRebind() depois, sem recriar o serviço
    }

    // START_STICKY: se o Android matar o processo por pressão de memória, tenta
    // recriar o serviço em seguida — sem os watchers antigos (eles não
    // sobrevivem à morte do processo de qualquer forma), mas evita que o
    // rastreio fique parado até o fiscal reabrir o app manualmente.
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        iniciarHeartbeatEmProcesso();
        agendarProximoAlarme();
        return START_STICKY;
    }

    Notification getNotification() {
        for (Watcher watcher : watchers) {
            if (watcher.backgroundNotification != null) {
                return watcher.backgroundNotification;
            }
        }
        return null;
    }

    // Handles requests from the activity.
    public class LocalBinder extends Binder {
        void addWatcher(
                final String id,
                Notification backgroundNotification,
                float distanceFilter
        ) {
            FusedLocationProviderClient client = LocationServices.getFusedLocationProviderClient(
                    BackgroundGeolocationService.this
            );
            LocationRequest locationRequest = new LocationRequest();
            locationRequest.setMaxWaitTime(1000);
            locationRequest.setInterval(1000);
            locationRequest.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);
            locationRequest.setSmallestDisplacement(distanceFilter);

            LocationCallback callback = new LocationCallback(){
                @Override
                public void onLocationResult(LocationResult locationResult) {
                    Location location = locationResult.getLastLocation();
                    Intent intent = new Intent(ACTION_BROADCAST);
                    intent.putExtra("location", location);
                    intent.putExtra("id", id);
                    LocalBroadcastManager.getInstance(
                            getApplicationContext()
                    ).sendBroadcast(intent);
                    gravarLocalizacaoNativa(location);
                }
                @Override
                public void onLocationAvailability(LocationAvailability availability) {
                    if (!availability.isLocationAvailable()) {
                        Logger.debug("Location not available");
                    }
                }
            };

            Watcher watcher = new Watcher();
            watcher.id = id;
            watcher.client = client;
            watcher.locationRequest = locationRequest;
            watcher.locationCallback = callback;
            watcher.backgroundNotification = backgroundNotification;
            boolean primeiroWatcher = watchers.isEmpty();
            watchers.add(watcher);
            if (primeiroWatcher) {
                iniciarHeartbeatEmProcesso();
                agendarProximoAlarme();
            }

            // According to Android Studio, this method can throw a Security Exception if
            // permissions are not yet granted. Rather than check the permissions, which is fiddly,
            // we simply ignore the exception.
            try {
                watcher.client.requestLocationUpdates(
                        watcher.locationRequest,
                        watcher.locationCallback,
                        null
                );
            } catch (SecurityException ignore) {}

            // Promote the service to the foreground if necessary.
            // Ideally we would only call 'startForeground' if the service is not already
            // foregrounded. Unfortunately, 'getForegroundServiceType' was only introduced
            // in API level 29 and seems to behave weirdly, as reported in #120. However,
            // it appears that 'startForeground' is idempotent, so we just call it repeatedly
            // each time a background watcher is added.
            if (backgroundNotification != null) {
                try {
                    // This method has been known to fail due to weird
                    // permission bugs, so we prevent any exceptions from
                    // crashing the app. See issue #86.
                    startForeground(NOTIFICATION_ID, backgroundNotification);
                } catch (Exception exception) {
                    Logger.error("Failed to foreground service", exception);
                }
            }
        }

        void removeWatcher(String id) {
            for (Watcher watcher : watchers) {
                if (watcher.id.equals(id)) {
                    watcher.client.removeLocationUpdates(watcher.locationCallback);
                    watchers.remove(watcher);
                    if (getNotification() == null) {
                        stopForeground(true);
                    }
                    if (watchers.isEmpty()) {
                        pararHeartbeatEmProcesso();
                        if (alarmManager != null && alarmPendingIntent != null) {
                            alarmManager.cancel(alarmPendingIntent);
                        }
                    }
                    return;
                }
            }
        }

        void onPermissionsGranted() {
            // If permissions were granted while the app was in the background, for example in
            // the Settings app, the watchers need restarting.
            for (Watcher watcher : watchers) {
                watcher.client.removeLocationUpdates(watcher.locationCallback);
                watcher.client.requestLocationUpdates(
                        watcher.locationRequest,
                        watcher.locationCallback,
                        null
                );
            }
        }

        void stopService() {
            BackgroundGeolocationService.this.stopSelf();
        }

        void configurarSupabase(String url, String anonKey, String schema, String fiscalLogin, String fiscalNome) {
            BackgroundGeolocationService.this.configurarSupabase(url, anonKey, schema, fiscalLogin, fiscalNome);
        }
    }
}
