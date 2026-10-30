#pragma once
// Debug helper for the Knob: POST an LVGL snapshot (raw RGB565) to a laptop.
// Streams straight from LVGL's draw buffer — a 360×360 frame is 259 kB, which
// neither internal RAM nor a std::string copy can hold. Blocks the main loop for
// the transfer (≈0.3–1 s on Wi-Fi), feeding the watchdog between chunks.
#include <cstdint>
#include <cstdio>
#include "esp_http_client.h"
#include "esphome/core/application.h"
#include "esphome/core/log.h"
#include "lvgl.h"

namespace owy {
inline void post_snapshot(const char *url) {
  static const char *TAG = "owy.shot";
  lv_draw_buf_t *buf = lv_snapshot_take(lv_screen_active(), LV_COLOR_FORMAT_RGB565);
  if (buf == nullptr) { ESP_LOGW(TAG, "snapshot failed (no memory?)"); return; }
  const uint32_t w = buf->header.w, h = buf->header.h, stride = buf->header.stride;
  const int total = int(w * h * 2);
  esp_http_client_config_t cfg = {};
  cfg.url = url;
  cfg.method = HTTP_METHOD_POST;
  cfg.timeout_ms = 6000;
  esp_http_client_handle_t client = esp_http_client_init(&cfg);
  char size[24];
  snprintf(size, sizeof(size), "%ux%u", unsigned(w), unsigned(h));
  esp_http_client_set_header(client, "Content-Type", "application/octet-stream");
  esp_http_client_set_header(client, "X-Size", size);
  esp_err_t err = esp_http_client_open(client, total);
  if (err == ESP_OK) {
    for (uint32_t y = 0; y < h && err == ESP_OK; y++) {
      const char *row = reinterpret_cast<const char *>(buf->data + size_t(y) * stride);
      int sent = 0;
      while (sent < int(w * 2)) {
        const int n = esp_http_client_write(client, row + sent, int(w * 2) - sent);
        if (n < 0) { err = ESP_FAIL; break; }
        sent += n;
      }
      if ((y & 31) == 0) esphome::App.feed_wdt();
    }
    if (err == ESP_OK) {
      esp_http_client_fetch_headers(client);
      ESP_LOGI(TAG, "%s posted %d B → HTTP %d", size, total, esp_http_client_get_status_code(client));
    }
  }
  if (err != ESP_OK) ESP_LOGW(TAG, "post to %s failed: %s", url, esp_err_to_name(err));
  esp_http_client_close(client);
  esp_http_client_cleanup(client);
  lv_draw_buf_destroy(buf);
}
}  // namespace owy
