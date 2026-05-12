import { supabase } from './supabase.js'

let intervalId = null
let watchId    = null

export function iniciarRastreio(usuario) {
  if (!usuario || !navigator.geolocation) return

  // Pede permissão e começa a rastrear
  const enviarPosicao = async (pos) => {
    try {
      await supabase.from('localizacoes').insert({
        fiscal_login: usuario.login,
        fiscal_nome:  usuario.nome,
        lat:          pos.coords.latitude,
        lng:          pos.coords.longitude,
        precisao:     pos.coords.accuracy,
      })
    } catch (e) {
      console.error('Erro ao enviar posição:', e)
    }
  }

  // Envia imediatamente
  navigator.geolocation.getCurrentPosition(enviarPosicao, console.error, {
    enableHighAccuracy: true, timeout: 10000,
  })

  // Envia a cada 10 segundos
  intervalId = setInterval(() => {
    navigator.geolocation.getCurrentPosition(enviarPosicao, console.error, {
      enableHighAccuracy: true, timeout: 10000,
    })
  }, 10000)
}

export function pararRastreio() {
  if (intervalId) { clearInterval(intervalId); intervalId = null }
  if (watchId)    { navigator.geolocation.clearWatch(watchId); watchId = null }
}
