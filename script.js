var supabase = window.supabase;
// Configuración del admin
let sistemaListo = false;
// Variables globales
let cartonesOcupados = [];
let precioPorCarton = 0;
let cantidadPermitida = 0;
let promocionSeleccionada = null;
let modoCartones = "libre";
let cantidadFijaCartones = 1;
let detectorIniciado = false;

// Variables de sesión
let adminSession = null;
let sesionActiva = false;

const CONFIG_OTP = {
  ACTIVADO: true,                     // Activar/desactivar OTP
  TIEMPO_EXPIRACION: 10,              // Minutos para usar el código
  REENVIOS_MAXIMOS: 2,                // Máximo de reenvíos
  REQUERIDO_SIEMPRE: true             // Siempre pedir OTP
};

let credencialesVerificadas = {
  email: '',
  password: '',
  deviceId: '',
  timestamp: 0
};

let reenviosRealizados = 0;
// Timeout de sesión (30 minutos)
const SESSION_TIMEOUT = 30 * 60 * 1000;
console.log('✅ SESSION_TIMEOUT =', SESSION_TIMEOUT, 'ms =', SESSION_TIMEOUT/60000, 'minutos');
let inactivityTimer;

// Timeout OTP (10 minutos)
let otpTimeout = null;
const OTP_TIMEOUT = 10 * 60 * 1000;

const promociones = [
  { id: 1, activa: false, descripcion: '', cantidad: 0, precio: 0 },
  { id: 2, activa: false, descripcion: '', cantidad: 0, precio: 0 },
  { id: 3, activa: false, descripcion: '', cantidad: 0, precio: 0 },
  { id: 4, activa: false, descripcion: '', cantidad: 0, precio: 0 }
];

let usuario = {
  nombre: '',
  telefono: '',
  cedula: '',
  referido: '',
  cartones: [],
};

let totalCartones = 0;
// ==================== VERSIÓN MÁS SIMPLE ====================
let contador = 0;

// Registrar listener en el logo después de cargar
setTimeout(() => {
  const logo = document.querySelector('#bienvenida img, .logo, h1');

  if (logo) {
    logo.addEventListener('click', () => {
      contador++;

      // Reset del contador en 3 segundos
      setTimeout(() => { contador = 0; }, 3000);

      // Si son 7 clicks
      if (contador === 7) {
        contador = 0;

        const botonAdmin = document.getElementById('boton-admin-oculto');
        if (botonAdmin) {
          botonAdmin.style.display = 'inline-block';
          alert('🔓 Botón Admin activado');
        }
      }
    });
  }
}, 1000);

// Registrar listener del botón Admin **solo una vez**
const botonAdmin = document.getElementById('boton-admin-oculto');
if (botonAdmin) {
  botonAdmin.addEventListener('click', async () => {
    if (sesionActiva) {
      await entrarAdmin(); // Abre panel admin si ya hay sesión activa
    } else {
      mostrarVentana('admin-login'); // Solo muestra el login
    }
  });
}
// ==================== FUNCIONES DE CONFIGURACIÓN ====================
async function getConfigValue(clave, fallback = null) {
  const { data, error } = await supabase
    .from('configuracion')
    .select('valore, valor')
    .eq('clave', clave)
    .single();

  if (error || !data) return fallback;
  return (data.valore ?? data.valor ?? fallback);
}

async function setConfigValue(clave, value) {
  const { error } = await supabase
    .from('configuracion')
    .upsert([{ clave, valore: value }], { onConflict: 'clave' });
  return !error;
}

// ==================== SISTEMA DE SESIÓN ÚNICA ====================
// Función para cerrar sesión
 async function cerrarSesionAdmin() {
  // Cierre “silencioso” para expiración / sesión inválida
  // No pedir confirmación, solo cerrar.
  await logoutAdminSilencioso();
}

// Igual que logoutAdmin, pero sin confirm()
async function logoutAdminSilencioso() {
  const email = sessionStorage.getItem('admin_email');
  const deviceId =
    sessionStorage.getItem('device_id') ||
    localStorage.getItem('admin_device_id') ||
    localStorage.getItem('device_id');

  const sessionToken = sessionStorage.getItem('admin_session_token');

  try {
    if (email && deviceId) {
      await fetch('https://dbkixcpwirjwjvjintkr.supabase.co/functions/v1/admin-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRia2l4Y3B3aXJqd2p2amludGtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwNjYxNDksImV4cCI6MjA2MTY0MjE0OX0.QJmWLWSe-pRYwxWeel8df7JLhNUvMKaTpL0MCDorgho'
        },
        body: JSON.stringify({ action: 'logout', email, deviceId, sessionToken })
      });
    }
  } catch (e) {
    console.warn('Logout silencioso falló (red), limpiando local igual:', e);
  } finally {
    clearAdminSession();
    resetToLoginState();
  }
}

// ========== FUNCIÓN LOGOUT COMPATIBLE CON TU CÓDIGO ==========
async function logoutAdmin() {
  // TÚ usas sessionStorage, no localStorage:
  const email = sessionStorage.getItem('admin_email');
  const deviceId = localStorage.getItem('admin_device_id');
  const sessionToken = sessionStorage.getItem('admin_session_token');
  
  console.log('🔍 Datos para logout:', { email, deviceId, sessionToken });
  
  if (!email || !deviceId) {
    console.log("⚠️ No hay sesión activa completa");
    // Aún así redirigir
    resetToLoginState();
    return;
  }

  try {
    // Opcional: confirmación
    if (!confirm('¿Estás seguro de cerrar sesión?\n\n✅ Esto liberará tu dispositivo para iniciar en otro lugar.')) {
      return;
    }
    
    console.log('🔄 Enviando logout al servidor...');
    
    const response = await fetch(
      'https://dbkixcpwirjwjvjintkr.supabase.co/functions/v1/admin-auth',
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRia2l4Y3B3aXJqd2p2amludGtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwNjYxNDksImV4cCI6MjA2MTY0MjE0OX0.QJmWLWSe-pRYwxWeel8df7JLhNUvMKaTpL0MCDorgho'
        },
        body: JSON.stringify({
          action: 'logout',
          email: email,
          deviceId: deviceId,
          sessionToken: sessionToken
        })
      }
    );
    
    console.log('📡 Estado respuesta logout:', response.status);
    const result = await response.json();
    console.log('📦 Resultado logout:', result);
    
    if (result.success) {
      console.log('✅ Logout exitoso en servidor');
      clearAdminSession();
      alert('✅ Sesión cerrada. Ahora puedes iniciar en otro dispositivo.');
      resetToLoginState();
    } else {
      console.error("❌ Error del servidor al cerrar sesión:", result.error);
      // Aún así limpiar localmente
      clearAdminSession();
      resetToLoginState();
    }
    
  } catch (error) {
    console.error("❌ Error en logout:", error);
    // Aún así limpiar localmente
    clearAdminSession();
    resetToLoginState();
  }
}

// ========== FUNCIÓN PARA LIMPIAR SESIÓN (COMPATIBLE) ==========
function clearAdminSession() {
  console.log('🧹 Limpiando sesión...');
  
  // Limpiar sessionStorage (lo que TÚ usas)
  sessionStorage.removeItem('admin_session_token');
  sessionStorage.removeItem('admin_email');
  sessionStorage.removeItem('session_expires');
  sessionStorage.removeItem('device_id');
  
  // NO limpiar el device_id de localStorage, se reutiliza
  // localStorage.removeItem('admin_device_id');  // ← NO hacer esto
  
  // Limpiar variables globales (si las tienes)
  if (typeof adminSession !== 'undefined') {
    adminSession = null;
  }
  if (typeof sesionActiva !== 'undefined') {
    sesionActiva = false;
  }
  
  // Detener timers si existen
  if (typeof inactivityTimer !== 'undefined' && inactivityTimer) {
    clearTimeout(inactivityTimer);
  }
  if (typeof sessionCheckInterval !== 'undefined' && sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
  }
  
  // Eliminar elementos del DOM que puedan existir
  const sessionInfo = document.getElementById('session-info');
  if (sessionInfo) sessionInfo.remove();
  
  console.log('✅ Sesión limpiada localmente');
}

// ========== FUNCIÓN PARA VOLVER A LOGIN (COMPATIBLE) ==========
function resetToLoginState() {
  console.log('🔄 Regresando a estado de login...');
  
  // Ocultar panel, mostrar login
  const adminPanel = document.getElementById('admin-panel');
  const adminLogin = document.getElementById('admin-login');
  
  if (adminPanel) adminPanel.classList.add('oculto');
  if (adminLogin) adminLogin.classList.remove('oculto');
  
  // Limpiar campos
  const adminPassword = document.getElementById('admin-password');
  const adminError = document.getElementById('admin-error');
  
  if (adminPassword) adminPassword.value = '';
  if (adminError) {
    adminError.textContent = '';
    adminError.className = '';
  }
}

// ========== CONFIGURAR EVENT LISTENER ==========
document.addEventListener('DOMContentLoaded', function() {
  const logoutBtn = document.getElementById('logoutBtn');
  
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logoutAdmin);
    console.log('✅ Botón de logout configurado');
  }
});



// ==================== NUEVA: VERIFICACIÓN SESIÓN ÚNICA POR USUARIO ====================
// Función para verificar si el usuario YA tiene sesión activa (en cualquier navegador)
async function verificarSesionAdmin() {
  const sessionToken =
    sessionStorage.getItem('admin_session_token') ||
    localStorage.getItem('admin_session_token');

  const deviceId =
    sessionStorage.getItem('device_id') ||
    localStorage.getItem('admin_device_id');

  if (!sessionToken || !deviceId) return false;

  try {
    const response = await fetch(
      'https://dbkixcpwirjwjvjintkr.supabase.co/functions/v1/verify-session',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRia2l4Y3B3aXJqd2p2amludGtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwNjYxNDksImV4cCI6MjA2MTY0MjE0OX0.QJmWLWSe-pRYwxWeel8df7JLhNUvMKaTpL0MCDorgho',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRia2l4Y3B3aXJqd2p2amludGtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwNjYxNDksImV4cCI6MjA2MTY0MjE0OX0.QJmWLWSe-pRYwxWeel8df7JLhNUvMKaTpL0MCDorgho'
        },
        body: JSON.stringify({ sessionToken, deviceId })
      }
    );

    if (!response.ok) return false;

    const result = await response.json();
    console.log('VERIFY SESSION:', result);

    if (result.expiresAt) {
      sessionStorage.setItem('session_expires', result.expiresAt);
      localStorage.setItem('session_expires', result.expiresAt);
    }

    return result.valid === true && result.sameDevice === true;
  } catch (err) {
    console.error('Error verificando sesión:', err);
    return false;
  }
}


// Función para mostrar alerta de sesión duplicada
function mostrarAlertaSesionDuplicada() {
  // Crear overlay bloqueante
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
  `;
  
  const alerta = document.createElement('div');
  alerta.style.cssText = `
    background: white;
    padding: 30px;
    border-radius: 10px;
    text-align: center;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
  `;
  
  
  overlay.appendChild(alerta);
  document.body.appendChild(overlay);
}

// ==================== FIN NUEVAS FUNCIONES ====================


// ==================== LOGIN CON DOBLE FACTOR ====================
// ==================== LOGIN SEGURO CON EDGE FUNCTION ====================
async function loginAdmin() {
  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-password').value;
  const errorDiv = document.getElementById('admin-error');
  
  errorDiv.textContent = '';
  errorDiv.className = '';
  errorDiv.style.whiteSpace = 'pre-line';
  
  if (!email || !password) {
    errorDiv.textContent = 'Por favor ingresa email y contraseña';
    errorDiv.className = 'error';
    return;
  }
  
  console.log('🔄 Iniciando login con sesión única + OTP...');
  
  try {
    errorDiv.textContent = '🔐 Verificando credenciales...';
    errorDiv.className = 'info';
    
    // Obtener o generar deviceId único
    let deviceId = localStorage.getItem('admin_device_id');
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('admin_device_id', deviceId);
    }
    
    console.log('📱 Device ID:', deviceId);
    
    // ========== PASO 1: VERIFICAR CREDENCIALES ==========
    errorDiv.textContent = '🔐 Verificando email y contraseña...';
    
    const response = await fetch(
      'https://dbkixcpwirjwjvjintkr.supabase.co/functions/v1/admin-auth',
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRia2l4Y3B3aXJqd2p2amludGtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwNjYxNDksImV4cCI6MjA2MTY0MjE0OX0.QJmWLWSe-pRYwxWeel8df7JLhNUvMKaTpL0MCDorgho'
        },
        body: JSON.stringify({ 
          email: email.toLowerCase().trim(), 
          password: password,
          deviceId: deviceId,
          action: 'verify_credentials' // Nueva acción para solo verificar
        })
      }
    );
    
    console.log('📡 Estado respuesta:', response.status);
    const result = await response.json();
    console.log('📦 Resultado:', result);
    
    if (!response.ok) {
      // MANEJO DE ERRORES ESPECÍFICOS
      if (result.error === "SESION_ACTIVA_OTRO_DISPOSITIVO") {
        errorDiv.innerHTML = `
          ⚠️ <strong>¡Ya tienes una sesión activa!</strong><br><br>
          No puedes iniciar sesión en múltiples dispositivos/navegadores.<br><br>
          <strong>Solución:</strong><br>
          1. Ve al otro dispositivo/navegador<br>
          2. Cierra sesión allí primero<br>
          3. Intenta de nuevo aquí
        `;
        errorDiv.className = 'warning';
      } else if (result.error === "SESION_ACTIVA") {
        errorDiv.innerHTML = '⚠️ Ya tienes una sesión activa en otro lugar';
        errorDiv.className = 'warning';
      } else {
        errorDiv.textContent = result.error || 'Error de autenticación';
        errorDiv.className = 'error';
      }
      
      document.getElementById('admin-password').value = '';
      return;
    }
    
    // ========== PASO 2: CREDENCIALES CORRECTAS - ENVIAR OTP ==========
    console.log('✅ Credenciales verificadas correctamente');
    
    // Guardar credenciales temporalmente
    sessionStorage.setItem('pending_email', email);
    sessionStorage.setItem('pending_deviceId', deviceId);
    sessionStorage.setItem('pending_password', password); // Solo para referencia
    
    errorDiv.innerHTML = '✅ <strong>Credenciales correctas</strong><br>📧 Enviando código de verificación...';
    errorDiv.className = 'success';
    
    // Enviar OTP
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin
      }
    });
    
    if (otpError) {
      console.error('❌ Error enviando OTP:', otpError);
      
      // Fallback: continuar sin OTP si hay error
      errorDiv.textContent = '⚠️ Error enviando OTP. Continuando sin verificación...';
      
      // Proceder directamente a crear sesión
      await crearSesionDirecta(email, deviceId);
      return;
    }
    
    console.log('✅ OTP enviado a:', email);
    
    // ========== PASO 3: MOSTRAR INTERFAZ OTP ==========
    mostrarInterfazOTP(email);
    
  } catch (error) {
    console.error('❌ Error en login:', error);
    
    let errorMsg = 'Error de conexión';
    if (error.message.includes('Failed to fetch')) {
      errorMsg = 'Error de red. Verifica tu conexión a internet';
    } else {
      errorMsg = error.message;
    }
    
    errorDiv.textContent = errorMsg;
    errorDiv.className = 'error';
    document.getElementById('admin-password').value = '';
  }
}

// ==================== FUNCIONES OTP ====================

function mostrarInterfazOTP(email) {
  // Ocultar campos de login
  const emailField = document.getElementById('admin-email').parentElement;
  const passwordField = document.getElementById('admin-password').parentElement;
  const loginButton = document.querySelector('button[onclick="loginAdmin()"]');
  
  if (emailField) emailField.style.display = 'none';
  if (passwordField) passwordField.style.display = 'none';
  if (loginButton) loginButton.style.display = 'none';
  
  // Crear o mostrar contenedor OTP
  let otpContainer = document.getElementById('otp-container');
  
  if (!otpContainer) {
    otpContainer = document.createElement('div');
    otpContainer.id = 'otp-container';
    otpContainer.style.cssText = `
      margin-top: 20px;
      padding: 20px;
      border: 2px solid #4CAF50;
      border-radius: 10px;
      background: #f9f9f9;
    `;
    
    otpContainer.innerHTML = `
      <h3 style="color: #4CAF50; margin-top: 0;">🔐 Verificación en Dos Pasos</h3>
      <p>✅ <strong>Credenciales verificadas</strong></p>
      <p>📧 Código enviado a: <strong id="otp-email-display">${email}</strong></p>
      
      <div style="margin: 15px 0;">
        <label for="otp-code"><strong>Código de 6 dígitos:</strong></label><br>
        <input type="text" id="otp-code" 
               placeholder="123456" 
               maxlength="6" 
               style="font-size: 20px; text-align: center; letter-spacing: 8px; padding: 10px; width: 160px; border: 2px solid #ddd; border-radius: 5px;"
               oninput="this.value = this.value.replace(/\D/g, '').slice(0,6)">
      </div>
      
      <div style="margin: 15px 0;">
        <button onclick="verificarOTP()" 
                style="background: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 5px; font-size: 16px; cursor: pointer;">
          ✅ Verificar Código
        </button>
        
        <button onclick="reenviarOTP()" 
                style="background: #FF9800; color: white; padding: 10px 20px; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; margin-left: 10px;">
          🔄 Reenviar
        </button>
        
        <button onclick="cancelarOTP()" 
                style="background: #f44336; color: white; padding: 10px 20px; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; margin-left: 10px;">
          ❌ Cancelar
        </button>
      </div>
      
      <div id="otp-timer" style="color: #666; font-size: 14px;">
        ⏰ Código válido por: <span id="otp-countdown">10:00</span>
      </div>
      
      <div id="otp-error" style="color: #f44336; margin-top: 10px; min-height: 20px;"></div>
    `;
    
    const loginSection = document.getElementById('admin-login');
    loginSection.appendChild(otpContainer);
  } else {
    otpContainer.style.display = 'block';
    document.getElementById('otp-email-display').textContent = email;
  }
  
  // Iniciar timer
  iniciarTimerOTP();
  
  // Enfocar campo OTP
  setTimeout(() => {
    const otpInput = document.getElementById('otp-code');
    if (otpInput) otpInput.focus();
  }, 100);
}

async function verificarOTP() {
  const otpCode = document.getElementById('otp-code').value.trim();
  const errorDiv = document.getElementById('otp-error') || document.getElementById('admin-error');
  const email = sessionStorage.getItem('pending_email');
  const deviceId = sessionStorage.getItem('pending_deviceId');
  
  console.log('🔍 Verificando OTP...', { email, deviceId, otpCode });
  
  if (!otpCode || otpCode.length !== 6) {
    mostrarErrorOTP('❌ Ingresa un código de 6 dígitos');
    return;
  }
  
  if (!email || !deviceId) {
    mostrarErrorOTP('❌ Sesión expirada. Vuelve a intentar.');
    cancelarOTP();
    return;
  }
  
  try {
    mostrarErrorOTP('🔐 Verificando código...');
    document.getElementById('otp-code').disabled = true;
    
    // 1. VERIFICAR OTP CON SUPABASE AUTH
    const { data, error } = await supabase.auth.verifyOtp({
      email: email,
      token: otpCode,
      type: 'email'
    });
    
    if (error) {
      if (error.message.includes('token has expired')) {
        mostrarErrorOTP('❌ El código ha expirado. Solicita uno nuevo.');
      } else if (error.message.includes('invalid')) {
        mostrarErrorOTP('❌ Código incorrecto. Intenta de nuevo.');
      } else {
        mostrarErrorOTP('❌ Error: ' + error.message);
      }
      document.getElementById('otp-code').disabled = false;
      document.getElementById('otp-code').focus();
      return;
    }
    
    console.log('✅ OTP verificado correctamente');
    mostrarErrorOTP('✅ Código correcto. Creando sesión...');
    
    // 2. CREAR SESIÓN ÚNICA CON EDGE FUNCTION (¡ESTO FALTA!)
    console.log('🔄 Creando sesión única después de OTP...');
    
    const response = await fetch(
      'https://dbkixcpwirjwjvjintkr.supabase.co/functions/v1/admin-auth',
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRia2l4Y3B3aXJqd2p2amludGtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwNjYxNDksImV4cCI6MjA2MTY0MjE0OX0.QJmWLWSe-pRYwxWeel8df7JLhNUvMKaTpL0MCDorgho'
        },
        body: JSON.stringify({ 
          email: email.toLowerCase().trim(), 
          deviceId: deviceId,
          action: 'create_session_otp' // ¡IMPORTANTE!
        })
      }
    );
    
    console.log('📡 Respuesta Edge Function:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error creando sesión');
    }
    
    const result = await response.json();
    console.log('✅ Sesión creada:', result);
    
    // 3. GUARDAR DATOS DE SESIÓN
    sessionStorage.setItem('admin_session_token', result.sessionToken);
    sessionStorage.setItem('admin_email', result.email);
    sessionStorage.setItem('session_expires', result.expiresAt);
    sessionStorage.setItem('device_id', result.deviceId);
    localStorage.setItem('admin_session_token', result.sessionToken);
    
    localStorage.setItem('admin_email', result.email);
    localStorage.setItem('session_expires', result.expiresAt);
    localStorage.setItem('admin_device_id', result.deviceId);
    
    // Actualizar deviceId si es necesario
    if (result.deviceId && result.deviceId !== deviceId) {
      localStorage.setItem('admin_device_id', result.deviceId);
    }
    
    // Variables globales
    adminSession = { email: result.email, token: result.sessionToken };
    sesionActiva = true;
    
    // Limpiar datos temporales
    sessionStorage.removeItem('pending_email');
    sessionStorage.removeItem('pending_deviceId');
    sessionStorage.removeItem('pending_password');
    
    // 4. MOSTRAR ÉXITO Y REDIRIGIR
    mostrarErrorOTP('✅ ¡Autenticación completada! Redirigiendo...');
    
    // Redirigir al panel
    setTimeout(() => {
      document.getElementById('admin-login').classList.add('oculto');
      document.getElementById('admin-panel').classList.remove('oculto');
      document.getElementById('admin-email-display').textContent = result.email;
      
      // Iniciar controles
      iniciarDetectorActividad();
      resetInactivityTimer();
    
      
      // Cargar panel
      cargarPanelAdmin();
      activarRefrescoAutomaticoAdmin();
      
    }, 1000);
    
  } catch (error) {
    console.error('❌ Error en verificarOTP:', error);
    mostrarErrorOTP('❌ Error: ' + error.message);
    document.getElementById('otp-code').disabled = false;
  }
}
async function crearSesionUnicaOTP(email, deviceId) {
  try {
    const response = await fetch(
      'https://dbkixcpwirjwjvjintkr.supabase.co/functions/v1/admin-auth',
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRia2l4Y3B3aXJqd2p2amludGtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwNjYxNDksImV4cCI6MjA2MTY0MjE0OX0.QJmWLWSe-pRYwxWeel8df7JLhNUvMKaTpL0MCDorgho'
        },
        body: JSON.stringify({ 
          email: email.toLowerCase().trim(), 
          deviceId: deviceId,
          action: 'create_session_otp' // Nueva acción para crear sesión después de OTP
        })
      }
    );
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error creando sesión');
    }
    
    // Guardar datos de sesión
    sessionStorage.setItem('admin_session_token', result.sessionToken);
    sessionStorage.setItem('admin_email', result.email);
    sessionStorage.setItem('session_expires', result.expiresAt);
    sessionStorage.setItem('device_id', result.deviceId);
    
    // Actualizar deviceId si es necesario
    if (result.deviceId && result.deviceId !== deviceId) {
      localStorage.setItem('admin_device_id', result.deviceId);
    }
    
    // Variables globales
    adminSession = { email: result.email, token: result.sessionToken };
    sesionActiva = true;
    
    // Limpiar datos temporales
    sessionStorage.removeItem('pending_email');
    sessionStorage.removeItem('pending_deviceId');
    sessionStorage.removeItem('pending_password');
    
    // Mostrar éxito y redirigir
    const errorDiv = document.getElementById('admin-error');
    errorDiv.innerHTML = '✅ <strong>¡Acceso concedido!</strong><br>Verificación en dos pasos completada';
    errorDiv.className = 'success';
    
    // Redirigir al panel
    setTimeout(() => {
      document.getElementById('admin-login').classList.add('oculto');
      document.getElementById('admin-panel').classList.remove('oculto');
      document.getElementById('admin-email-display').textContent = result.email;
      
      // Iniciar controles
      iniciarDetectorActividad();
      resetInactivityTimer();
      
      // Cargar panel
      cargarPanelAdmin();
      
    }, 1000);
    
  } catch (error) {
    console.error('❌ Error creando sesión:', error);
    mostrarErrorOTP('❌ Error creando sesión: ' + error.message);
    
    // Rehabilitar campo OTP
    document.getElementById('otp-code').disabled = false;
  }
}

async function reenviarOTP() {
  const email = sessionStorage.getItem('pending_email');
  
  if (!email) {
    mostrarErrorOTP('❌ No hay email pendiente');
    return;
  }
  
  try {
    mostrarErrorOTP('🔄 Reenviando código...');
    
    const { error } = await supabase.auth.signInWithOtp({
      email: email,
      options: { shouldCreateUser: false }
    });
    
    if (error) throw error;
    
    mostrarErrorOTP('✅ Código reenviado');
    
    // Reiniciar timer
    iniciarTimerOTP();
    
  } catch (error) {
    console.error('Error reenviando OTP:', error);
    mostrarErrorOTP('❌ Error reenviando código');
  }
}

function cancelarOTP() {
  // Limpir timer
  clearInterval(window.otpTimerInterval);
  
  // Limpiar datos temporales
  sessionStorage.removeItem('pending_email');
  sessionStorage.removeItem('pending_deviceId');
  sessionStorage.removeItem('pending_password');
  
  // Ocultar OTP
  const otpContainer = document.getElementById('otp-container');
  if (otpContainer) {
    otpContainer.style.display = 'none';
  }
  
  // Mostrar campos de login
  const emailField = document.getElementById('admin-email').parentElement;
  const passwordField = document.getElementById('admin-password').parentElement;
  const loginButton = document.querySelector('button[onclick="loginAdmin()"]');
  
  if (emailField) emailField.style.display = 'block';
  if (passwordField) passwordField.style.display = 'block';
  if (loginButton) loginButton.style.display = 'block';
  
  // Limpiar campos
  document.getElementById('admin-password').value = '';
  if (document.getElementById('otp-code')) {
    document.getElementById('otp-code').value = '';
  }
  
  // Limpiar mensajes
  const errorDiv = document.getElementById('admin-error');
  if (errorDiv) {
    errorDiv.textContent = '';
    errorDiv.className = '';
  }
  
  // Enfocar email
  document.getElementById('admin-email').focus();
}

function iniciarTimerOTP() {
  clearInterval(window.otpTimerInterval);
  
  let tiempoRestante = 10 * 60; // 10 minutos en segundos
  
  window.otpTimerInterval = setInterval(() => {
    tiempoRestante--;
    
    if (tiempoRestante <= 0) {
      clearInterval(window.otpTimerInterval);
      mostrarErrorOTP('⏰ El código ha expirado');
      return;
    }
    
    const minutos = Math.floor(tiempoRestante / 60);
    const segundos = tiempoRestante % 60;
    
    const countdownElement = document.getElementById('otp-countdown');
    if (countdownElement) {
      countdownElement.textContent = `${minutos}:${segundos.toString().padStart(2, '0')}`;
      
      // Cambiar color cuando queden 2 minutos
      if (tiempoRestante <= 120) {
        countdownElement.style.color = '#f44336';
        countdownElement.style.fontWeight = 'bold';
      }
    }
  }, 1000);
}

function mostrarErrorOTP(mensaje) {
  const errorDiv = document.getElementById('otp-error');
  if (errorDiv) {
    errorDiv.textContent = mensaje;
    errorDiv.style.color = mensaje.startsWith('✅') ? '#4CAF50' : '#f44336';
  }
}

// Función fallback si OTP falla
async function crearSesionDirecta(email, deviceId) {
  try {
    const response = await fetch(
      'https://dbkixcpwirjwjvjintkr.supabase.co/functions/v1/admin-auth',
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRia2l4Y3B3aXJqd2p2amludGtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwNjYxNDksImV4cCI6MjA2MTY0MjE0OX0.QJmWLWSe-pRYwxWeel8df7JLhNUvMKaTpL0MCDorgho'
        },
        body: JSON.stringify({ 
          email: email.toLowerCase().trim(), 
          deviceId: deviceId,
          action: 'create_session_direct'
        })
      }
    );
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error creando sesión');
    }
    
    // Proceder con login normal
    sessionStorage.setItem('admin_session_token', result.sessionToken);
    sessionStorage.setItem('admin_email', result.email);
    sessionStorage.setItem('session_expires', result.expiresAt);
    sessionStorage.setItem('device_id', result.deviceId);
    
    adminSession = { email: result.email, token: result.sessionToken };
    sesionActiva = true;
    
    const errorDiv = document.getElementById('admin-error');
    errorDiv.innerHTML = '✅ <strong>¡Acceso concedido!</strong><br>Sesión única activa';
    errorDiv.className = 'success';
    
    setTimeout(() => {
      document.getElementById('admin-login').classList.add('oculto');
      document.getElementById('admin-panel').classList.remove('oculto');
      document.getElementById('admin-email-display').textContent = result.email;
      
      iniciarDetectorActividad();
      resetInactivityTimer();
      
      cargarPanelAdmin();
      
    }, 1000);
    
  } catch (error) {
    console.error('❌ Error en sesión directa:', error);
    const errorDiv = document.getElementById('admin-error');
    errorDiv.textContent = '❌ Error creando sesión: ' + error.message;
    errorDiv.className = 'error';
  }
}

// Función para forzar cierre remoto
async function forzarCerrarSesionRemota() {
  const errorDiv = document.getElementById('admin-error');
  
  try {
    errorDiv.textContent = '🔄 Forzando cierre de sesión remota...';
    errorDiv.className = 'info';
    
    // Aquí necesitarías crear otra   Edge Function o modificar la existente
    // para forzar el cierre de todas las sesiones
    
    // Por ahora, usamos un enfoque simple: limpiar la tabla
    const response = await fetch(
      'https://dbkixcpwirjwjvjintkr.supabase.co/functions/v1/update-session',
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRia2l4Y3B3aXJqd2p2amludGtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwNjYxNDksImV4cCI6MjA2MTY0MjE0OX0.QJmWLWSe-pRYwxWeel8df7JLhNUvMKaTpL0MCDorgho'
        },
        body: JSON.stringify({ 
          action: "force_logout_all"
        })
      }
    );
    if (response.ok) {
      errorDiv.innerHTML = '✅ Sesiones remotas cerradas.<br>Ahora puedes iniciar sesión.';
      errorDiv.className = 'success';
      
      // recargar la página después de 2 segundos
      setTimeout(() => {
        location.reload();
      }, 2000);
    } else {
      throw new Error('Error forzando cierre');
    }
    
  } catch (error) {
    console.error('❌ Error forzando cierre:', error);
    errorDiv.textContent = 'Error al forzar cierre remoto';
    errorDiv.className = 'error';
  }
}

// Función para cancelar login
function cancelarLogin() {
  const errorDiv = document.getElementById('admin-error');
  errorDiv.textContent = '';
  errorDiv.className = '';
  document.getElementById('admin-password').value = '';
}
// Función auxiliar para generar ID de dispositivo
function generateDeviceId() {
  let deviceId = localStorage.getItem('admin_device_id');

  if (!deviceId) {
    deviceId =
      'device_' +
      btoa(navigator.userAgent).substring(0, 20) + '_' +
      Date.now() + '_' +
      Math.random().toString(36).substr(2, 9);

    localStorage.setItem('admin_device_id', deviceId);
  }

  return deviceId;
}


// Función pa obtener IP del cliente (simplificada)
async function getClientIP() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch {
    return 'unknown';
  }
}

// Función para continuar con sesión exitosa
function proceedWithSession(sessionToken, email, expiresAt) {
  console.log('✅ Sesión única creada exitosamente');
  
  // Guardar sesión localmente
  sessionStorage.setItem('admin_session_token', sessionToken);
  sessionStorage.setItem('admin_email', email);
  sessionStorage.setItem('session_expires', expiresAt);
  sessionStorage.setItem('device_id', generateDeviceId());
  
  // Actualizar variables globales
  adminSession = { email: email, token: sessionToken };
  sesionActiva = true;
  
  // Mostrar mensaje de éxito
  const errorDiv = document.getElementById('admin-error');
  errorDiv.innerHTML = '✅ <strong>Autenticación exitosa!</strong><br><small>Sesión única activa</small>';
  errorDiv.className = 'success';
  
  setTimeout(() => {
    document.getElementById('admin-email-display').textContent = email;
    mostrarPanelAdminSeguro(sessionToken);
    
    // Iniciar controles de sesión
    iniciarDetectorActividad();
    resetInactivityTimer();
  }, 1000);
}
// Nueva función para mostrar panel seguro
async function mostrarPanelAdminSeguro(sessionToken) {
  console.log('🎉 Mostrando panel admin seguro');

  // Ocultar todas las secciones visibles
  document.querySelectorAll('section').forEach(sec => sec.classList.add('oculto'));

  // Ocultar login si estaba abierto
  document.getElementById('admin-login').classList.add('oculto');

  // Mostrar panel admin
  const panel = document.getElementById('admin-panel');
  panel.classList.remove('oculto');

  // Insertar info de sesión
  const sessionInfo = document.createElement('div');
  sessionInfo.id = 'session-info';
  sessionInfo.style.cssText = `
    margin: 10px 0;
    padding: 10px;
    border-radius: 5px;
    font-size: 14px;
    background: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
  `;
  sessionInfo.innerHTML = `
    🔒 <strong>SESIÓN SEGURA ACTIVA</strong><br>
    <small>Autenticación vía Edge Function</small><br>
    <small>Token: ${sessionToken?.substring(0, 25)}...</small>
  `;
  const firstElement = panel.querySelector('h2').nextElementSibling;
  if (firstElement) panel.insertBefore(sessionInfo, firstElement.nextSibling);

  // Cargar datos del panel y refresco automático
  await cargarPanelAdmin();
  activarRefrescoAutomaticoAdmin();

  // Llevar la ventana al top
  
}
// Función para verificar OTP

// Función para verificación periódica de sesión
let verificacionInterval = null;

function mostrarCampoOTP() {
  const loginForm = document.getElementById('login-fields');
  const email = sessionStorage.getItem('admin_email_temp') || '';
  
  // Crear contenedor OTP
  const otpContainer = document.getElementById('otp-container');
  if (otpContainer) {
    otpContainer.style.display = 'block';
    document.getElementById('otp-email-display').textContent = email;
  }
  
  // Ocultar campos de contraseña
  document.getElementById('admin-password').parentElement.style.display = 'none';
  document.querySelector('button[onclick="loginAdmin()"]').style.display = 'none';
  
  // Configurar timeout automático para OTP
  clearTimeout(otpTimeout);
  otpTimeout = setTimeout(() => {
    if (!sesionActiva) {
      const errorDiv = document.getElementById('admin-error');
      errorDiv.innerHTML = '⏰ <strong>Código expirado</strong><br>El código OTP ha expirado. Vuelve a intentar.';
      errorDiv.className = 'error';
      cancelarOTP();
    }
  }, OTP_TIMEOUT);
  
  document.getElementById('otp-code').focus();
}



// Generar token único para sesión
function generateSessionToken() {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Mostrar panel admin con OTP
async function mostrarPanelAdminOTP(sessionToken) {
  console.log('🎉 Mostrando panel admin con token:', sessionToken);
  
  document.getElementById('admin-login').classList.add('oculto');
  document.getElementById('admin-panel').classList.remove('oculto');
  
  // Mostrar estado de sesión única
  const sessionInfo = document.createElement('div');
  sessionInfo.id = 'session-info';
  sessionInfo.style.margin = '10px 0';
  sessionInfo.style.padding = '10px';
  sessionInfo.style.borderRadius = '5px';
  sessionInfo.style.fontSize = '14px';
  sessionInfo.style.background = '#d4edda';
  sessionInfo.style.color = '#155724';
  sessionInfo.style.border = '1px solid #c3e6cb';
  sessionInfo.innerHTML = `
    ✅ <strong>SESIÓN ÚNICA ACTIVA</strong><br>
    <small>Solo tú puedes acceder hasta que cierres sesión.</small><br>
    <small>Token: ${sessionToken?.substring(0, 20)}...</small>
  `;
  
  const panel = document.getElementById('admin-panel');
  const firstElement = panel.querySelector('h2').nextElementSibling;
  if (firstElement) {
    panel.insertBefore(sessionInfo, firstElement.nextSibling);
  }
  
  // Agregar botón de cerrar sesión prominente
  const cerrarBtn = document.createElement('button');
  cerrarBtn.textContent = '🔒 Cerrar Sesión (Liberar Panel)';
  cerrarBtn.className = 'btn-danger';
  cerrarBtn.style.margin = '10px 0';
  cerrarBtn.style.padding = '10px 20px';
  cerrarBtn.style.fontSize = '16px';
  cerrarBtn.onclick = logoutAdmin;
  
  // Agregar botón de forzar cierre remoto
  const forzarBtn = document.createElement('button');
  forzarBtn.textContent = '🔓 Forzar Cierre Remoto';
  forzarBtn.style.margin = '10px 10px';
  forzarBtn.style.padding = '10px 20px';
  forzarBtn.style.fontSize = '16px';
  forzarBtn.style.background = '#ff6b6b';
  forzarBtn.style.color = 'white';
  forzarBtn.style.border = 'none';
  forzarBtn.style.borderRadius = '5px';
  forzarBtn.onclick = forzarCerrarSesionRemota;
  
  if (firstElement) {
    panel.insertBefore(cerrarBtn, firstElement.nextSibling.nextSibling);
    panel.insertBefore(forzarBtn, cerrarBtn.nextSibling);
  }
  
  // Cargar datos del panel
  await cargarPanelAdmin();
  activarRefrescoAutomaticoAdmin();
}


// Función para actualizar actividad de sesión
function actualizarActividadSesion() {
  if (!sesionActiva) return;
  
  console.log('👀 Actividad detectada, actualizando sesión...');
  
  // Opcional: Notificar al servidor que la sesión sigue activa
  const sessionToken = sessionStorage.getItem('admin_session_token');
  if (sessionToken) {
    // Aquí puedes hacer una llamada a tu Edge Function si quieres
    // registrar la actividad en el servidor
    console.log('Sesión activa, token:', sessionToken.substring(0, 20) + '...');
  }
}
// Timer de inactividad
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  if (sesionActiva) {
    console.log('⏰ Reiniciando timer de inactividad (30 minutos)');
    inactivityTimer = setTimeout(async () => {
      if (sesionActiva) {
        console.log('⏰ Sesión expirada por inactividad');
        alert('Sesión expirada por inactividad (30 minutos)');
        await cerrarSesionAdmin();
      }
    }, SESSION_TIMEOUT);
  }
}

// Eventos para detectar actividad
function iniciarDetectorActividad() {
  if (detectorIniciado) return; // ⛔ evita doble ejecución
  detectorIniciado = true;

  console.log('👀 Iniciando detector de actividad');

  ['click', 'mousemove', 'keypress', 'scroll'].forEach(event => {
    document.addEventListener(event, () => {
      if (sesionActiva) {
        actualizarActividadSesion();
        resetInactivityTimer();
      }
    });
  });
}


// Limpiar storage temporal
function limpiarStorageTemporal() {
  sessionStorage.removeItem('admin_email_temp');
  clearTimeout(otpTimeout);
  
  // Limpiar tokens temporales de Supabase
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.includes('sb-')) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => localStorage.removeItem(key));
}

// ==================== VERIFICACIÓN INICIAL ====================
async function verificarSesionInicial() {
  console.log('🔍 Verificando sesión inicial al cargar...');

  // Ocultar panel y login mientras se verifica
  document.getElementById('admin-panel')?.classList.add('oculto');
  document.getElementById('admin-login')?.classList.add('oculto');
  document.getElementById('bienvenida')?.classList.remove('oculto');

  const sessionToken =
    sessionStorage.getItem('admin_session_token') ||
    localStorage.getItem('admin_session_token');

  if (!sessionToken) {
    console.log('ℹ️ No hay token guardado');
    return;
  }

  try {
    const esValida = await verificarSesionAdmin();

    if (esValida) {
      const email =
        sessionStorage.getItem('admin_email') ||
        localStorage.getItem('admin_email');

      console.log('✅ Sesión válida guardada para:', email);

      adminSession = { email, token: sessionToken };
      sesionActiva = true;

      if (document.getElementById('admin-email-display')) {
        document.getElementById('admin-email-display').textContent = email;
      }

      await cargarPanelAdmin();
      activarRefrescoAutomaticoAdmin();
      iniciarDetectorActividad();
      resetInactivityTimer();

      // **IMPORTANTE:** No abrir el panel automáticamente
      // Solo deja la sesión activa lista para cuando el usuario haga clic en Admin
      return;

    } else {
  console.log('⚠️ Sesión inválida, limpiando...');

  sessionStorage.removeItem('admin_session_token');
  sessionStorage.removeItem('admin_email');
  sessionStorage.removeItem('session_expires');
  sessionStorage.removeItem('device_id');

  localStorage.removeItem('admin_session_token');
  localStorage.removeItem('admin_email');
  localStorage.removeItem('session_expires');

  sesionActiva = false;
  adminSession = null;

  document.getElementById('admin-login')?.classList.add('oculto');
  document.getElementById('admin-panel')?.classList.add('oculto');
  document.getElementById('bienvenida')?.classList.remove('oculto');
}
 } catch (error) {
  console.error('❌ Error verificando sesión inicial:', error);

  sessionStorage.removeItem('admin_session_token');
  sessionStorage.removeItem('admin_email');
  sessionStorage.removeItem('session_expires');
  sessionStorage.removeItem('device_id');

  localStorage.removeItem('admin_session_token');
  localStorage.removeItem('admin_email');
  localStorage.removeItem('session_expires');

  sesionActiva = false;
  adminSession = null;

  document.getElementById('admin-login')?.classList.add('oculto');
  document.getElementById('admin-panel')?.classList.add('oculto');
  document.getElementById('bienvenida')?.classList.remove('oculto');
}
}
// ==================== FUNCIONES FALTANTES QUE NECESITA EL HTML ====================

// Función para ver lista de aprobados
async function verListaAprobados() {
  const { data, error } = await supabase
    .from('inscripciones')
    .select('*')
    .eq('estado', 'aprobado');

  const listaDiv = document.getElementById('listaAprobados');
  if (!listaDiv) {
    console.error('Elemento listaAprobados no encontrado');
    return;
  }
  
  listaDiv.innerHTML = '';

  if (error) {
    console.error('Error al obtener aprobados:', error);
    listaDiv.innerHTML = '<p>Error al obtener la lista.</p>';
    return;
  }

  if (data.length === 0) {
    listaDiv.innerHTML = '<p>No hay personas aprobadas.</p>';
    return;
  }

  const tabla = document.createElement('table');
  tabla.style.width = '100%';
  tabla.style.borderCollapse = 'collapse';
  tabla.innerHTML = `
    <thead>
      <tr>
        <th style="border: 1px solid #ccc; padding: 8px;">Nombre</th>
        <th style="border: 1px solid #ccc; padding: 8px;">Cédula</th>
        <th style="border: 1px solid #ccc; padding: 8px;">Referido</th>
        <th style="border: 1px solid #ccc; padding: 8px;">Teléfono</th>
        <th style="border: 1px solid #ccc; padding: 8px;">Cartones</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = tabla.querySelector('tbody');

  data.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="border: 1px solid #ccc; padding: 8px;">${item.nombre || ''}</td>
      <td style="border: 1px solid #ccc; padding: 8px;">${item.cedula || ''}</td>
      <td style="border: 1px solid #ccc; padding: 8px;">${item.referido || ''}</td>
      <td style="border: 1px solid #ccc; padding: 8px;">
        <a href="${buildWhatsAppLink(item.telefono, `Hola ${item.nombre}, tu inscripción fue aprobada.`)}"
           target="_blank" rel="noopener">
          ${item.telefono || ''}
        </a>
      </td>
      <td style="border: 1px solid #ccc; padding: 8px;">${Array.isArray(item.cartones) ? item.cartones.join(', ') : ''}</td>
    `;
    tbody.appendChild(tr);
  });

  listaDiv.appendChild(tabla);
}

// Función para detectar cartones duplicados
async function detectarCartonesDuplicados() {
  const boton = document.getElementById('btnDuplicados');
  if (!boton) return;
  
  const prev = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Buscando duplicados...';

  try {
    const { data, error } = await supabase
      .from('inscripciones')
      .select('id,nombre,cedula,estado,cartones')
      .in('estado', ['pendiente', 'aprobado']);

    if (error) throw error;

    const indice = new Map();

    (data || []).forEach(ins => {
      if (!Array.isArray(ins.cartones)) return;

      const únicos = new Set(
        ins.cartones
          .map(x => {
            if (typeof x === 'number') return x;
            if (typeof x === 'string') return parseInt(x, 10);
            try {
              const s = (x && typeof x === 'object') ? JSON.stringify(x) : String(x);
              return parseInt(s.replace(/[^0-9\-]/g,''), 10);
            } catch { return NaN; }
          })
          .filter(n => Number.isFinite(n))
      );

      únicos.forEach(n => {
        if (!indice.has(n)) indice.set(n, []);
        indice.get(n).push({ id: ins.id, nombre: ins.nombre || '', cedula: ins.cedula || '' });
      });
    });

    const duplicados = [];
    const duplicadosSet = new Set();
    
    for (const [numero, dueños] of indice.entries()) {
      if (dueños.length > 1) {
        duplicados.push({
          numero,
          personas: dueños,
          veces: dueños.length
        });
        duplicadosSet.add(numero);
      }
    }

    duplicados.sort((a, b) => (b.veces - a.veces) || (a.numero - b.numero));

    renderDuplicados(duplicados);
    resaltarCeldasDuplicadas(duplicadosSet);

  } catch (e) {
    console.error(e);
    const cont = document.getElementById('duplicadosResultado');
    if (cont) {
      cont.innerHTML = '<p style="color:#f44336;">Error buscando duplicados. Revisa la consola.</p>';
    }
  } finally {
    boton.disabled = false;
    boton.textContent = prev;
  }
}

// Función auxiliar para renderizar duplicados
function renderDuplicados(lista) {
  const cont = document.getElementById('duplicadosResultado');
  if (!cont) return;
  
  cont.innerHTML = '';

  if (!lista.length) {
    cont.innerHTML = '<p style="color:#4caf50;font-weight:bold;">No se encontraron cartones duplicados en inscripciones activas.</p>';
    return;
  }

  const tabla = document.createElement('table');
  tabla.style.width = '100%';
  tabla.style.borderCollapse = 'collapse';
  tabla.innerHTML = `
    <thead>
      <tr>
        <th style="border:1px solid #ccc;padding:6px;">Cartón</th>
        <th style="border:1px solid #ccc;padding:6px;">Personas</th>
        <th style="border:1px solid #ccc;padding:6px;">Veces</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  
  const tbody = tabla.querySelector('tbody');

  lista.forEach(row => {
    const tr = document.createElement('tr');
    
    const tdNumero = document.createElement('td');
    tdNumero.style.border = '1px solid #ccc';
    tdNumero.style.padding = '6px';
    tdNumero.textContent = String(row.numero);
    
    const tdPersonas = document.createElement('td');
    tdPersonas.style.border = '1px solid #ccc';
    tdPersonas.style.padding = '6px';
    tdPersonas.textContent = row.personas.map(p => `${p.nombre} (${p.cedula})`).join(', ');
    
    const tdVeces = document.createElement('td');
    tdVeces.style.border = '1px solid #ccc';
    tdVeces.style.padding = '6px';
    tdVeces.textContent = String(row.veces);
    
    tr.appendChild(tdNumero);
    tr.appendChild(tdPersonas);
    tr.appendChild(tdVeces);
    tbody.appendChild(tr);
  });

  cont.appendChild(tabla);
}

// Función auxiliar para resaltar celdas duplicadas
function resaltarCeldasDuplicadas(duplicadosSet) {
  const cartonesCells = document.querySelectorAll('#tabla-comprobantes tbody tr td:nth-child(5)');
  cartonesCells.forEach(td => {
    const nums = td.textContent
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n));

    const tieneDuplicado = nums.some(n => duplicadosSet.has(n));
    td.style.backgroundColor = tieneDuplicado ? 'rgba(255,0,0,0.18)' : '';
  });
}

// Función para r huérfanos
async function verHuerfanos() {
  const btn = document.getElementById('btnVerHuerfanos');
  if (!btn) return;
  
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Buscando...';
  
  try {
    const { data, error } = await supabase.rpc('rpc_listar_cartones_huerfanos', {
      _min_age: '5 minutes'
    });
    
    if (error) throw error;
    
    renderTablaHuerfanos(data || []);
    
  } catch (e) {
    console.error(e);
    const resultado = document.getElementById('huerfanosResultado');
    if (resultado) {
      resultado.innerHTML = '<p style="color:#f44336;">Error buscando huérfanos. Revisa consola.</p>';
    }
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

// Función para renderizar tabla de huérfanos
function renderTablaHuerfanos(rows) {
  const cont = document.getElementById('huerfanosResultado');
  if (!cont) return;
  
  cont.innerHTML = '';

  if (!rows || rows.length === 0) {
    cont.innerHTML = '<p style="color:#4caf50;font-weight:bold;">No hay cartones huérfanos.</p>';
    return;
  }

  const tabla = document.createElement('table');
  tabla.style.width = '100%';
  tabla.style.borderCollapse = 'collapse';
  tabla.innerHTML = `
    <thead>
      <tr>
        <th style="border:1px solid #ccc;padding:6px;">Cartón</th>
        <th style="border:1px solid #ccc;padding:6px;">Reservado desde</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  
  const tbody = tabla.querySelector('tbody');

  rows.forEach(r => {
    const tr = document.createElement('tr');
    
    const tdNumero = document.createElement('td');
    tdNumero.style.border = '1px solid #ccc';
    tdNumero.style.padding = '6px';
    tdNumero.textContent = r.numero;
    
    const tdFecha = document.createElement('td');
    tdFecha.style.border = '1px solid #ccc';
    tdFecha.style.padding = '6px';
    tdFecha.textContent = r.created_at ? new Date(r.created_at).toLocaleString() : '';
    
    tr.appendChild(tdNumero);
    tr.appendChild(tdFecha);
    tbody.appendChild(tr);
  });

  cont.appendChild(tabla);
}

// Función para liberar huérfanos
async function liberarHuerfanos() {
  if (!confirm('¿Liberar todos los cartones huérfanos?')) return;
  
  const btn = document.getElementById('btnLiberarHuerfanos');
  if (!btn) return;
  
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Limpiando...';
  
  try {
    const { data, error } = await supabase.rpc('rpc_liberar_cartones_huerfanos', {
      _min_age: '5 minutes'
    });
    
    if (error) throw error;

    alert(`Listo. Cartones liberados: ${data ?? 0}`);
    
    await verHuerfanos();
    await cargarCartones();
    await contarCartonesVendidos();
    
  } catch (e) {
    console.error(e);
    alert('Error al liberar huérfanos.');
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

// Función para guardar precio por cartón
async function guardarPrecioPorCarton() {
  const nuevoPrecio = parseFloat(document.getElementById('precioCarton').value);
  if (isNaN(nuevoPrecio) || nuevoPrecio < 0) {
    alert('Ingrese un precio válido');
    return;
  }

  const { error } = await supabase
    .from('configuracion')
    .upsert({ clave: 'precio_carton', valore: nuevoPrecio.toString() }, { onConflict: 'clave' });

  if (error) {
    alert('Error guardando el precio');
    console.error(error);
  } else {
    alert('Precio actualizado correctamente');
    precioPorCarton = nuevoPrecio;
    await cargarPrecioPorCarton();
  }
}

// ==================== FUNCIONES EXISTENTES ====================

async function obtenerMontoTotalRecaudado() {
   const { data, error } = await supabase
    .from('inscripciones')
    .select('monto_bs, cartones')
    .eq('estado', 'aprobado'); 

  if (error) {
    console.error('Error al obtener inscripciones:', error.message);
    return;
  }

  let total = 0;
  
  for (const ins of (data || [])) {
    let m = Number(ins.monto_bs);
    if (!(m > 0)) {
      const unidades = Array.isArray(ins.cartones) ? ins.cartones.length : 0;
      m = unidades * (precioPorCarton || 0);
    }
    total += m;
  }

  const totalElement = document.getElementById('totalMonto');
  if (totalElement) {
    totalElement.textContent = new Intl.NumberFormat('es-VE', { 
      style: 'currency', 
      currency: 'VES' 
    }).format(total);
  }
}

async function contarCartonesVendidos() {
  const { count, error } = await supabase
    .from('cartones')
    .select('numero', { count: 'exact', head: true });

  if (error) {
    console.error('Error al contar cartones:', error);
    return;
  }
  
  const totalVendidosElement = document.getElementById('total-vendidos');
  if (totalVendidosElement) {
    totalVendidosElement.textContent = count || 0;
  }
  
  return count || 0;
}

function renderizarBotonesPromociones() {
  const promoBox = document.getElementById('promoBox');
  if (!promoBox) return;

  let algunaActiva = false;
  
  promociones.forEach((promo, index) => {
    const boton = document.querySelector(`[data-promo="${index + 1}"]`);
    const descElement = document.getElementById(`promo-desc-${index + 1}`);
    const precioElement = document.getElementById(`promo-precio-${index + 1}`);
    
    if (boton && descElement && precioElement) {
      if (promo.activa && promo.cantidad > 0 && promo.precio > 0) {
        descElement.textContent = promo.descripcion;
        precioElement.textContent = `${promo.precio.toFixed(2)} Bs`;
        boton.classList.remove('desactivado');
        algunaActiva = true;
        boton.title = `${promo.cantidad} cartones por ${promo.precio.toFixed(2)} Bs`;
        
        boton.onclick = () => seleccionarPromocion(index + 1);
      } else {
        descElement.textContent = `Promo ${index + 1} (No disponible)`;
        precioElement.textContent = 'No disponible';
        boton.classList.add('desactivado');
        boton.onclick = null;
      }
      
      boton.classList.remove('seleccionado');
    }
  });
  
  promoBox.classList.toggle('oculto', !algunaActiva);
}

// ==================== FUNC PINCILES ====================
window.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Inicializando sistema...');
    sistemaListo = false;
  // Crear ta¿'bl ses nxiste
   document.getElementById('modal-terminos').classList.remove('oculto');
   obtenerTotalCartones();
  await cargarLinkWhatsapp();
  document.getElementById('overlay-carga').style.display = 'none';

  await Promise.all([
    cargarDatosClienteLocal(),
  activarProgresoCartonesRealtime(),
  generarCartones(),
    cargarBarraProgresoInicio(),
    cargarConfigBarraProgresoAdmin(),
    cargarImagenPremiosInicio(),
    cargarPrecioPorCarton(),
    cargarConfiguracionModoCartones(),
    cargarPromocionesConfig()
  ]);

  await verificarSesionInicial();


  
 
  // Event listes pefos
  document.getElementById('guardarPromocionesBtn')?.addEventListener('click', guardarPromociones);
  document.getElementById('btnDupNombreAprobados')?.addEventListener('click', detectarDuplicadosAprobadosPorNombre);
  document.getElementById('btnDupReferenciaAprobados')?.addEventListener('click', detectarDuplicadosAprobadosPorReferencia);
  document.getElementById('btnDuplicados')?.addEventListener('click', detectarCartonesDuplicados);
  document.getElementById('btnVerHuerfanos')?.addEventListener('click', verHuerfanos);
  document.getElementById('btnLiberarHuerfanos')?.addEventListener('click', liberarHuerfanos);
  document.getElementById('guardarPrecioBtn')?.addEventListener('click', guardarPrecioPorCarton);
  document.getElementById('cerrarVentasBtn')?.addEventListener('click', cerrarVentas);
  document.getElementById('abrirVentasBtn')?.addEventListener('click', abrirVentas);
  document.getElementById('imprimirListaBtn')?.addEventListener('click', imprimirLista);
  document.getElementById('verListaBtn')?.addEventListener('click', verListaAprobados);
  document.getElementById('guardarModoCartonesBtn')?.addEventListener('click', guardarModoCartones);
  document.getElementById('modoCartonesSelect')?.addEventListener('change', cambiarModoCartones);
  
  // Cargar likde WhatsApp
    sistemaListo = true;
  // Mostrar términos

  document.getElementById('overlay-carga').style.display = 'none';
  console.log('✅ Sistema inicializado correctamente');
});

async function obtenerTotalCartones() {
  const { data, error } = await supabase
    .from('configuracion')
    .select('valore')
    .eq('clave', 'total_cartones')
    .single();

  totalCartones = (!error && data) ? parseInt(data.valore, 10) || 0 : 0;
}

async function cargarPrecioPorCarton() {
  const { data, error } = await supabase
    .from('configuracion')
    .select('valore')
    .eq('clave', 'precio_carton')
    .single();

  if (!error && data) {
    precioPorCarton = parseFloat(data.valore);
  } else {
    console.error('Error cargando el precio del cartón', error);
    precioPorCarton = 0;
  }
}

function generarCartones() {
  console.log(`Sistema de bingo inicializado con ${totalCartones} cartones disponibles`);
}

function actualizarPreseleccion() {
  let cant = parseInt(document.getElementById('cantidadCartones').value) || 1;
  const maxDisponibles = totalCartones - cartonesOcupados.length;
  
  if (modoCartones === 'fijo') {
    cant = cantidadFijaCartones;
    document.getElementById('cantidadCartones').value = cantidadFijaCartones;
  } else {
    cant = Math.min(cant, maxDisponibles);
    document.getElementById('cantidadCartones').value = cant;
  }

  document.getElementById('monto-preseleccion').textContent =
    (cant * precioPorCarton).toFixed(2);
}

document.addEventListener('DOMContentLoaded', () => {

  const btnMas = document.getElementById('btnMas');
  const btnMenos = document.getElementById('btnMenos');
  const inputCantidad = document.getElementById('cantidadCartones');

  if (btnMas && inputCantidad) {
    btnMas.onclick = () => {
      if (modoCartones === 'fijo') return;
      inputCantidad.stepUp();
      limpiarPromoPorCambioCantidad();
    };
  }

  if (btnMenos && inputCantidad) {
    btnMenos.onclick = () => {
      if (modoCartones === 'fijo') return;
      inputCantidad.stepDown();
      limpiarPromoPorCambioCantidad();
    };
  }

  if (inputCantidad) {
    inputCantidad.addEventListener('input', function () {
      if (modoCartones === 'fijo') {
        this.value = cantidadFijaCartones;
      }
      limpiarPromoPorCambioCantidad();
    });
  }

  // ⏰ Hora Venezuela (mover aquí evita errores en móviles)
  actualizarHoraVenezuela();
  setInterval(actualizarHoraVenezuela, 1000);

  // 🛡️ Detector de actividad SOLO cuando el DOM existe
  iniciarDetectorActividad();

});


function limpiarPromoPorCambioCantidad() {
  if (promocionSeleccionada) {
    deseleccionarPromocion();
  }
  actualizarPreseleccion();
}

function isTrue(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

async function mostrarVentana(id) {
  if (!sistemaListo) return;
  if (id === 'top-compradores') {
  await cargarTopCompradores();
     activarTopCompradoresRealtime()
}
  if (id === 'admin') {
    await entrarAdmin();
    return;
  }
  
  // 1) Si va a CARTONES, valida ventas_abierta
  if (id === 'cartones') {
    const { data } = await supabase
      .from('configuracion')
      .select('valore, valor')
      .eq('clave', 'ventas_abierta')
      .single();

    const ventasAbierta = data ? (data.valore ?? data.valor ?? 'true') : 'true';
    if (!isTrue(ventasAbierta)) {
      alert('Las ventas están cerradas');
      document.querySelectorAll('section').forEach(s => s.classList.add('oculto'));
      document.getElementById('bienvenida').classList.remove('oculto');
      return;
    }
  }

  // 2) Si va a PAGO, valida cantidad exacta
  if (id === 'pago') {
    const requerido = (modoCartones === 'fijo') ? cantidadFijaCartones : cantidadPermitida;
    if (usuario.cartones.length !== requerido) {
      alert(`Debes elegir exactamente ${requerido} cartones antes de continuar.`);
      return;
      
    }
  }

  // 3) Mostrar la ventana solicitada
  document.querySelectorAll('section').forEach(s => s.classList.add('oculto'));
  const target = document.getElementById(id);
  if (target) target.classList.remove('oculto');
requestAnimationFrame(() => {
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
});

  if (id === 'cantidad') {
    promocionSeleccionada = null;
    await cargarPromocionesConfig();
    actualizarPreseleccion();
  }
  
  if (id === 'pago') {
    const promo = getPromocionSeleccionada();
    const monto = promo ? promo.precio : (usuario.cartones.length * (precioPorCarton || 0));
    document.getElementById('monto-pago').textContent = monto.toFixed(2);
     iniciarContadorReserva(5);
  }
  
  if (id === 'cartones') {
    await cargarCartones();
  }

  if (id === 'lista-aprobados') {
    await cargarListaAprobadosSeccion();
  }
}

// Guardar datos del formulario
function guardarDatosInscripcion() {
  usuario.nombre = document.getElementById('nombre').value;
  usuario.telefono = document.getElementById('telefono').value;
  usuario.cedula = document.getElementById('cedula').value;
  usuario.referido = document.getElementById('referido').value;
  usuario.cartones = [];
  mostrarVentana('cantidad')
  actualizarPreseleccion(); 
  guardarDatosClienteLocal();
}

function confirmarCantidad() {
  const promo = getPromocionSeleccionada();
  let cant;
  
  if (promo) {
    cant = promo.cantidad;
  } else {
    cant = parseInt(document.getElementById('cantidadCartones').value);
    const maxDisponibles = totalCartones - cartonesOcupados.length;
    
    if (modoCartones === 'fijo') {
      if (cant !== cantidadFijaCartones) {
        document.getElementById('cantidadCartones').value = cantidadFijaCartones;
        cant = cantidadFijaCartones;
      }
    } else {
      if (isNaN(cant) || cant < 1) {
        return alert('Ingresa un número válido');
      }
      if (cant > maxDisponibles) {
        return alert(`Solo quedan ${maxDisponibles} cartones disponibles`);
      }
    }
  }
  
  cantidadPermitida = cant;
  usuario.cartones = [];
  mostrarVentana('cartones');
}

// ==================== FUNCIONES DE CARTONES ====================
async function cargarCartones() {
  const { error: errorHuerfanos } = await supabase.rpc('rpc_liberar_cartones_huerfanos', {
    _min_age: '5 minutes'
  });

  if (errorHuerfanos) {
    console.error('Error liberando huérfanos:', errorHuerfanos);
  }

  cartonesOcupados = await fetchTodosLosOcupados();
  const ocupadosSet = new Set(cartonesOcupados);

  const contenedor = document.getElementById('contenedor-cartones');
  contenedor.innerHTML = '';

  for (let i = 1; i <= totalCartones; i++) {
    const carton = document.createElement('div');
    carton.textContent = i;
    carton.classList.add('carton');

    if (ocupadosSet.has(i)) {
      carton.classList.add('ocupado');
    } else {
      carton.onclick = () => abrirModalCarton(i, carton);
    }

    contenedor.appendChild(carton);
  }

  await contarCartonesVendidos();

  actualizarContadorCartones(
    totalCartones,
    Number(document.getElementById('total-vendidos').textContent) || cartonesOcupados.length,
    usuario.cartones.length
  );

  actualizarMonto();
}

async function toggleCarton(num, elem) {
  const index = usuario.cartones.indexOf(num);

  // Deseleccionar
  if (index >= 0) {
  usuario.cartones.splice(index, 1);
  elem.classList.remove('seleccionado');

  const { error: errorLiberar } = await supabase.rpc('rpc_liberar_reserva', {
    _numero: num,
    _cedula: usuario.cedula,
    _partida_id: null
  });
 if (errorLiberar) {
    console.error('Error liberando reserva:', errorLiberar);
  }
    
    document.querySelectorAll('.carton.bloqueado').forEach(c => {
    const n = parseInt(c.textContent);
    if (!cartonesOcupados.includes(n) && !usuario.cartones.includes(n)) {
      c.classList.remove('bloqueado');
      c.onclick = () => abrirModalCarton(n, c);
    }
  });
    actualizarContadorCartones(totalCartones, cartonesOcupados.length, usuario.cartones.length);
    actualizarMonto();
    return;
  }

  // No permitir más de la cantidad elegida
  if (usuario.cartones.length >= cantidadPermitida) return;

  // Reservar en Supabase de forma segura
  const { data, error } = await supabase.rpc('rpc_reservar_carton', {
    _numero: num,
    _cedula: usuario.cedula,
    _partida_id: null
  });

  if (error || data !== true) {
    alert('Ese cartón ya fue tomado por otra persona. Elige otro.');
    await cargarCartones();
    return;
  }

  usuario.cartones.push(num);
  elem.classList.add('seleccionado');

  if (usuario.cartones.length === cantidadPermitida) {
    document.querySelectorAll('.carton').forEach(c => {
      const n = parseInt(c.textContent);
      const yaSeleccionado = usuario.cartones.includes(n);
      const yaOcupado = cartonesOcupados.includes(n);

      if (!yaSeleccionado && !yaOcupado) {
        c.classList.add('bloqueado');
        c.onclick = null;
      }
    });
  }

  actualizarContadorCartones(totalCartones, cartonesOcupados.length, usuario.cartones.length);
  actualizarMonto();
}

function actualizarMonto() {
  let total;
  const promo = getPromocionSeleccionada();
  
  if (promo && usuario.cartones.length === promo.cantidad) {
    total = promo.precio;
  } else {
    total = (usuario.cartones.length || 0) * (precioPorCarton || 0);
  }
  
  const nodo = document.getElementById('monto-total');
  if (nodo) nodo.textContent = total.toFixed(2);
}

// ==================== FUNCIONES DE PAGO ====================
async function enviarComprobante() {
  const boton = document.getElementById('btnEnviarComprobante');
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Cargando comprobante...';

  try {
    if (!usuario.nombre || !usuario.telefono || !usuario.cedula) {
      throw new Error('Debes completar primero los datos de inscripción');
    }

    const referencia4dig = document.getElementById('referencia4dig').value.trim();
    if (!/^\d{4}$/.test(referencia4dig)) {
      throw new Error('Debes ingresar los últimos 4 dígitos de la referencia bancaria.');
    }
const PagoBanco = document.getElementById('pago_banco').value.trim();
const PagoTelefono = document.getElementById('pago_telefono').value.trim();
const PagoCedula = document.getElementById('pago_cedula').value.trim();

if (!PagoBanco || !PagoTelefono || !PagoCedula) {
  throw new Error('Debes registrar tu Pago Móvil para el pago ganador.');
}

guardarDatosPagoClienteAutomatico();
    const archivo = document.getElementById('comprobante').files[0];
    if (!archivo) throw new Error('Debes subir un comprobante');

    const ext = archivo.name.split('.').pop();
    const nombreArchivo = `${usuario.cedula}-${Date.now()}.${ext}`;
    const { error: errorUpload } = await supabase.storage
      .from('comprobantes')
      .upload(nombreArchivo, archivo);
    if (errorUpload) throw new Error('Error subiendo imagen');

    const urlPublica = `${supabaseUrl}/storage/v1/object/public/comprobantes/${nombreArchivo}`;

    const promo = getPromocionSeleccionada();
    const monto = promo ? promo.precio : (usuario.cartones.length * (precioPorCarton || 0));
    
    const { error: errorInsert } = await supabase.from('inscripciones').insert([{
      nombre: usuario.nombre,
      telefono: usuario.telefono,
      cedula: usuario.cedula,
      referido: usuario.referido,
      cartones: usuario.cartones,
      referencia4dig: referencia4dig,
      comprobante: urlPublica,
      estado: 'pendiente',
      monto_bs: monto,
      pago_banco: PagoBanco,
      pago_telefono: PagoTelefono,
      pago_cedula: PagoCedula,
      usa_promo: !!promo,
      promo_desc: promo ? promo.descripcion : null,
      precio_unitario_bs: promo ? null : (precioPorCarton || 0) 
    }]);

    if (errorInsert) {
      await supabase.rpc('rpc_liberar_reserva', {
  _cedula: usuario.cedula,
  _partida_id: null
});
      throw new Error('Error guardando la inscripción');
    }
clearInterval(timerReserva);
    alert('Inscripción y comprobante enviados con éxito');
    location.reload();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Ocurrió un error inesperado');
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

// ==================== fUNCIONES DE USUARIO ====================
async function consultarCartones() {
  const cedula = document.getElementById('consulta-cedula').value;
  const { data } = await supabase.from('inscripciones').select('*').eq('cedula', cedula);
  const cont = document.getElementById('cartones-usuario');
  cont.innerHTML = '';
  data.forEach(item => {
    item.cartones.forEach(num => {
      const img = document.createElement('img');
      img.src = `${supabaseUrl}/storage/v1/object/public/cartones/SERIAL_BINGOANDINO75_CARTON_${String(num).padStart(5, '0')}.jpg`;
      img.classList.add('carton-consulta-img');
      img.style.margin = '5px';
      cont.appendChild(img);
    });
  });
}

async function elegirMasCartones() {
  const cedula = document.getElementById('consulta-cedula').value;
  const { data, error } = await supabase.from('inscripciones').select('*').eq('cedula', cedula);

  if (error || data.length === 0) {
    return alert('No se encontró ningún usuario con esa cédula');
  }

  const inscripcion = data[0];
  usuario.nombre = inscripcion.nombre;
  usuario.telefono = inscripcion.telefono;
  usuario.cedula = inscripcion.cedula;
  usuario.referido = inscripcion.referido;
  usuario.cartones = [];

  mostrarVentana('cantidad');
  actualizarPreseleccion();
}

// ==================== FUNCIONES DEL PANEL ADMIN ====================
async function cargarPanelAdmin() {
  await obtenerMontoTotalRecaudado();
  await contarCartonesVendidos();
  await cargarModoCartonesAdmin();
  await cargarCartones();
  await cargarPromocionesAdmin();
  
  const { data, error } = await supabase
    .from('inscripciones')
    .select('*')
    .order('id', { ascending: false });

  if (error) {
    console.error(error);
    return alert('Error cargando inscripciones');
  }

  const tbody = document.querySelector('#tabla-comprobantes tbody');
  tbody.innerHTML = '';

  data.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.nombre}</td>
      <td>
        <a href="${buildWhatsAppLink(item.telefono, `Hola ${item.nombre}, te escribo de parte del equipo de bingoandino75.`)}"
           target="_blank" rel="noopener">
          ${item.telefono}
        </a>
      </td>
      <td>${item.cedula}</td>
      <td>${item.referido}</td>
      <td>${item.cartones.join(', ')}</td>
      <td class="celda-ref" data-id="${item.id}">
        <span class="ref-text">${item.referencia4dig || ''}</span>
        <button class="btn-accion btn-edit-ref" title="Editar">&#9998;</button>
      </td>
      <td><a href="${item.comprobante}" target="_blank">
            <img src="${item.comprobante}" alt="Comp.">
          </a></td>
          <td class="pago-ganador-admin">
  <strong>${item.pago_banco || 'Sin banco'}</strong><br>
  📱 ${item.pago_telefono || 'Sin número'}<br>
  🪪 ${item.pago_cedula || 'Sin cédula'}
   <button
    class="btn-copiar-pago"
    onclick="copiarPagoMovil(
      '${item.pago_banco || ''}',
      '${item.pago_telefono || ''}',
      '${item.pago_cedula || ''}'
    )">
    📋 Copiar
  </button>
</td>
      <td>
        <span class="estado-circulo ${item.estado === 'aprobado' ? 'verde' : 'rojo'}"></span>
        <button class="btn-accion btn-aprobar" title="Aprobar">&#x2705;</button>
        <button class="btn-accion btn-rechazar" title="Rechazar">&#x274C;</button>
        <button class="btn-accion btn-eliminar" title="Eliminar">&#x1F5D1;</button>
      </td>
    `;

    const btnAprobar = tr.querySelector('.btn-aprobar');
    const btnRechazar = tr.querySelector('.btn-rechazar');
    const btnEliminar = tr.querySelector('.btn-eliminar');
    const btnEditRef = tr.querySelector('.btn-edit-ref');

    btnAprobar.onclick = () => aprobarInscripcion(item.id, tr);
    btnRechazar.onclick = () => rechazarInscripcion(item, tr);
    btnEliminar.onclick = () => eliminarInscripcion(item, tr);
    btnEditRef.onclick = () => editarReferencia(tr.querySelector('.celda-ref'));
    
    if (item.estado === 'aprobado') {
      btnAprobar.disabled = true;
      btnRechazar.disabled = true;
    } else if (item.estado === 'rechazado') {
      btnAprobar.disabled = true;
      btnRechazar.disabled = true;
    }

    tbody.appendChild(tr);
  });

  document.getElementById('contador-clientes').textContent = data.length;
  document.getElementById('contadorCartones').innerText = 
    `Cartones disponibles: ${totalCartones - cartonesOcupados.length} de ${totalCartones}`;
  const pendientes = data.filter(item => item.estado === 'pendiente').length;
document.getElementById('pendientes-count').textContent = pendientes;
}
document.getElementById('btn-recargar-panel').addEventListener('click', () => {
  cargarPanelAdmin();  // Llama directamente a la función que refresca el contenido
});

async function aprobarInscripcion(id, fila) {
  const { error } = await supabase
    .from('inscripciones')
    .update({ estado: 'aprobado' })
    .eq('id', id);

  if (error) {
    console.error(error);
    return alert('No se pudo aprobar');
  }

  fila.querySelectorAll('button').forEach(b => (b.disabled = true));
  const circulo = fila.querySelector('.estado-circulo');
  if (circulo) circulo.classList.replace('rojo', 'verde');
  alert('¡Inscripción aprobada!');
}

async function rechazarInscripcion(item, fila) {
  const confirma = confirm('¿Seguro que deseas rechazar y liberar cartones?');
  if (!confirma) return;

  if (item.cartones.length) {
    const { error: errCart } = await supabase
      .from('cartones')
      .delete()
      .in('numero', item.cartones);
    if (errCart) {
      console.error(errCart);
      return alert('Error liberando cartones');
    }
  }

  const { error: errUpd } = await supabase
    .from('inscripciones')
    .update({ estado: 'rechazado' })
    .eq('id', item.id);

  if (errUpd) {
    console.error(errUpd);
    return alert('Error actualizando inscripción');
  }

  fila.querySelectorAll('button').forEach(b => (b.disabled = true));
  alert('Inscripción rechazada y cartones liberados');
}

async function eliminarInscripcion(item, fila) {
  const confirmar = confirm('¿Eliminar esta inscripción? Se liberarán solo los cartones que nadie más tenga.');
  if (!confirmar) return;

  try {
    const { data, error } = await supabase.rpc('rpc_eliminar_inscripcion_seguro', { _id: item.id });
    if (error) throw error;

    if (item.comprobante) {
      const nombreArchivo = item.comprobante.split('/').pop();
      await supabase.storage.from('comprobantes').remove([nombreArchivo]);
    }

    fila.remove();
    await contarCartonesVendidos();
    await obtenerMontoTotalRecaudado();
    await cargarCartones();

    alert(`Inscripción eliminada. Cartones liberados: ${data ?? 0}`);
  } catch (e) {
    console.error(e);
    alert('Error al eliminar inscripción.');
  }
}

async function cerrarVentas() {
  const confirmacion = confirm("¿Estás seguro que quieres cerrar las ventas?");
  if (!confirmacion) return;

  const { error } = await supabase
    .from('configuracion')
    .update({ valor: false })
    .eq('clave', 'ventas_abierta');

  if (error) {
    alert("Error al cerrar las ventas");
    console.error(error);
  } else {
    alert("Ventas cerradas correctamente");
    location.reload();
  }
}

async function abrirVentas() {
  const confirmacion = confirm("¿Estás seguro que quieres abrir las ventas?");
  if (!confirmacion) return;

  const { error } = await supabase
    .from('configuracion')
    .update({ valor: true })
    .eq('clave', 'ventas_abierta');

  if (error) {
    alert("Error al abrir las ventas");
    console.error(error);
  } else {
    alert("Ventas abiertas correctamente");
    location.reload();
  }
}

async function reiniciarTodo() {
  if (!confirm('⚠️ ¿Estás seguro de reiniciar todo?\n\nEsto borrará todos los datos permanentemente.')) {
    return;
  }
  
  const claveIngresada = prompt('🔒 INGRESA LA CLAVE DE SEGURIDAD PARA CONTINUAR:');
  
  if (!claveIngresada) {
    alert('❌ Operación cancelada. No se ingresó clave.');
    return;
  }
  
  const { data: claveData, error } = await supabase
    .from('configuracion')
    .select('valore')
    .eq('clave', 'clave_reinicio')
    .single();
  
  if (error || !claveData) {
    alert('❌ Error del sistema. No se pudo verificar la clave.');
    return;
  }
  
  const claveCorrecta = claveData.valore;
  
  if (claveIngresada.trim() !== claveCorrecta) {
    alert('❌ CLAVE INCORRECTA\n\nOperación cancelada por seguridad.');
    return;
  }
  
  if (!confirm('🔥 ÚLTIMA CONFIRMACIÓN\n\n¿Estás ABSOLUTAMENTE seguro?\n\nEsto NO se puede deshacer.')) {
    alert('✅ Operación cancelada.');
    return;
  }
  
  await supabase.from('inscripciones').delete().neq('cedula', '');
  await supabase.from('cartones').delete().neq('numero', 0);

  let totalEliminados = 0;
  const pageSize = 1500;
  let offset = 0;

  while (true) {
    const { data: files, error: listErr } = await supabase.storage
      .from('comprobantes')
      .list('', { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } });

    if (listErr) {
      alert('Error listando comprobantes: ' + listErr.message);
      break;
    }
    if (!files || files.length === 0) break;

    const names = files.map(f => f.name);
    const { error: delErr } = await supabase.storage.from('comprobantes').remove(names);
    if (delErr) {
      alert('Error eliminando comprobantes: ' + delErr.message);
      break;
    }

    totalEliminados += names.length;
    if (files.length < pageSize) break;
    offset += pageSize;
  }

  alert(`✅ Datos reiniciados. Comprobantes eliminados: ${totalEliminados}`);
  location.reload();
}

// ==================== FUNCIONES DE MODAL ====================
let cartonSeleccionadoTemporal = null;
let cartonElementoTemporal = null;

function abrirModalCarton(numero, elemento) {
  cartonSeleccionadoTemporal = numero;
  cartonElementoTemporal = elemento;
  const img = document.getElementById('imagen-carton-modal');
  img.src = `${supabaseUrl}/storage/v1/object/public/cartones/SERIAL_BINGOANDINO75_CARTON_${String(numero).padStart(5, '0')}.jpg`;

  document.getElementById('modal-carton').classList.remove('oculto');

  const btn = document.getElementById('btnSeleccionarCarton');
  btn.onclick = async () => {
  await toggleCarton(cartonSeleccionadoTemporal, cartonElementoTemporal);
  cerrarModalCarton();
};
}

function cerrarModalCarton() {
  document.getElementById('modal-carton').classList.add('oculto');
  cartonSeleccionadoTemporal = null;
  cartonElementoTemporal = null;
}

function actualizarContadorCartones(total, ocupados, seleccionados) {
  const disponibles = total - ocupados - seleccionados;
  const contador = document.getElementById('contadorCartones');
  contador.textContent = `Cartones disponibles: ${disponibles} de ${total}`;
}

// ==================== FUNCIONES AUXILIARES ====================
async function guardarNuevoTotal() {
  const nuevoTotal = parseInt(document.getElementById("nuevoTotalCartones").value, 10);
  const estado = document.getElementById("estadoTotalCartones");

  if (isNaN(nuevoTotal) || nuevoTotal < 1) {
    estado.textContent = "Número inválido.";
    return;
  }

  const { error } = await supabase
    .from('configuracion')
    .upsert(
      [{ clave: 'total_cartones', valore: String(nuevoTotal) }],
      { onConflict: 'clave' }
    );

  if (error) {
    console.error('guardarNuevoTotal error:', error);
    estado.textContent = "Error al actualizar.";
  } else {
    estado.textContent = "¡Total actualizado!";
    totalCartones = nuevoTotal;
  }
}

async function cargarPromocionesConfig() {
  try {
    for (let i = 0; i < promociones.length; i++) {
      const promo = promociones[i];
      const prefix = `promo${i + 1}`;
      
      promo.activa = (await getConfigValue(`${prefix}_activa`, 'false')) === 'true';
      promo.descripcion = await getConfigValue(`${prefix}_descripcion`, `Promo ${i + 1}`);
      promo.cantidad = parseInt(await getConfigValue(`${prefix}_cantidad`, '0')) || 0;
      promo.precio = parseFloat(await getConfigValue(`${prefix}_precio`, '0')) || 0;
    }
    
    console.log('Promociones cargadas:', promociones);
    renderizarBotonesPromociones();
  } catch (error) {
    console.error('Error cargando promociones:', error);
  }
}

async function cargarPromocionesAdmin() {
  try {
    for (let i = 1; i <= 4; i++) {
      document.getElementById(`promo${i}_activa`).checked = 
        (await getConfigValue(`promo${i}_activa`, 'false')) === 'true';
      document.getElementById(`promo${i}_descripcion`).value = 
        await getConfigValue(`promo${i}_descripcion`, '');
      document.getElementById(`promo${i}_cantidad`).value = 
        parseInt(await getConfigValue(`promo${i}_cantidad`, '0')) || '';
      document.getElementById(`promo${i}_precio`).value = 
        parseFloat(await getConfigValue(`promo${i}_precio`, '0')) || '';
    }
  } catch (error) {
    console.error('Error cargando promociones en admin:', error);
  }
}

async function guardarPromociones() {
  const estado = document.getElementById('estadoPromociones');
  
  try {
    const updates = [];
    
    for (let i = 1; i <= 4; i++) {
      const activa = document.getElementById(`promo${i}_activa`).checked;
      const desc = document.getElementById(`promo${i}_descripcion`).value.trim();
      const cant = parseInt(document.getElementById(`promo${i}_cantidad`).value) || 0;
      const precio = parseFloat(document.getElementById(`promo${i}_precio`).value) || 0;
      
      updates.push(
        { clave: `promo${i}_activa`, valore: String(activa) },
        { clave: `promo${i}_descripcion`, valore: desc },
        { clave: `promo${i}_cantidad`, valore: String(cant) },
        { clave: `promo${i}_precio`, valore: String(precio) }
      );
    }
    
    const { error } = await supabase.from('configuracion').upsert(updates, { onConflict: 'clave' });
    
    if (error) {
      estado.textContent = 'Error guardando promociones';
      estado.style.color = 'red';
    } else {
      estado.textContent = '✅ Todas las promociones guardadas correctamente';
      estado.style.color = 'green';
      await cargarPromocionesConfig();
      setTimeout(() => { estado.textContent = ''; }, 3000);
    }
  } catch (error) {
    console.error('Error:', error);
    estado.textContent = 'Error inesperado al guardar';
    estado.style.color = 'red';
  }
}

function seleccionarPromocion(numero) {
  const promo = promociones[numero - 1];
  
  if (!promo.activa || promo.cantidad <= 0 || promo.precio <= 0) {
    alert('Esta promoción no está disponible en este momento.');
    return;
  }
  
  const maxDisponibles = totalCartones - cartonesOcupados.length;
  if (promo.cantidad > maxDisponibles) {
    alert(`No hay suficientes cartones disponibles para esta promoción. Disponibles: ${maxDisponibles}`);
    return;
  }
  
  if (promocionSeleccionada === numero) {
    deseleccionarPromocion();
    return;
  }
  
  promocionSeleccionada = numero;
  
  document.querySelectorAll('.btn-promo').forEach(btn => {
    btn.classList.remove('seleccionado');
  });
  
  const botonSeleccionado = document.querySelector(`[data-promo="${numero}"]`);
  if (botonSeleccionado) {
    botonSeleccionado.classList.add('seleccionado');
  }
  
  document.getElementById('cantidadCartones').value = promo.cantidad;
  actualizarPreseleccion();
}

function deseleccionarPromocion() {
  promocionSeleccionada = null;
  document.querySelectorAll('.btn-promo').forEach(btn => {
    btn.classList.remove('seleccionado');
  });
  document.getElementById('cantidadCartones').value = 1;
  actualizarPreseleccion();
}

function getPromocionSeleccionada() {
  return promocionSeleccionada ? promociones[promocionSeleccionada - 1] : null;
}

// ==================== FUNCIONES RESTANTES ====================
function mostrarSeccion(id) {
  const secciones = document.querySelectorAll('section');
  secciones.forEach(sec => sec.classList.add('oculto'));
  const target = document.getElementById(id);
  if (target) target.classList.remove('oculto');
  
    if (id === 'ganadores') {
    cargarGanadores();
  }
  
  const redes = document.getElementById('redes-sociales');
  if (redes) {
    redes.style.display = id === 'inicio' ? 'flex' : 'none';
  }
}

async function cargarListaAprobadosSeccion() {
  const { data, error } = await supabase
    .from('inscripciones')
    .select('*')
    .eq('estado', 'aprobado');

  const contenedor = document.getElementById('contenedor-aprobados');
  contenedor.innerHTML = '';

  if (error || !data.length) {
    contenedor.innerHTML = '<p>No hay aprobados aún.</p>';
    return;
  }

  const tabla = document.createElement('table');
  tabla.style.width = '100%';
  tabla.style.borderCollapse = 'collapse';
  tabla.innerHTML = `
    <thead>
      <tr>
        <th>Cartón</th>
        <th>Nombre</th>
        <th>Cédula</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = tabla.querySelector('tbody');
  let filas = [];

  data.forEach(item => {
    item.cartones.forEach(carton => {
      filas.push({
        carton,
        nombre: item.nombre,
        cedula: item.cedula
      });
    });
  });

  filas.sort((a, b) => a.carton - b.carton);

  filas.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.carton}</td>
      <td>${item.nombre}</td>
      <td>${item.cedula}</td>
    `;
    tbody.appendChild(tr);
  });

  contenedor.appendChild(tabla);
}

function actualizarHoraVenezuela() {
  const contenedor = document.getElementById('hora-venezuela');
  if (!contenedor) return;

  const opciones = {
    timeZone: 'America/Caracas',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  };

  const ahora = new Date();
  const formato = new Intl.DateTimeFormat('es-VE', opciones).format(ahora);
  contenedor.textContent = `📅 ${formato}`;
}

async function guardarLinkWhatsapp() {
  const link = document.getElementById('inputWhatsapp').value.trim();
  if (!link) return alert('Ingresa un enlace válido');

  const { error } = await supabase
    .from('configuracion')
    .upsert([{ clave: 'link_whatsapp', valore: link }], { onConflict: 'clave' });

  if (error) {
    alert('Error guardando el enlace');
    console.error(error);
  } else {
    alert('Enlace guardado');
  }
}
async function cargarLinkWhatsapp() {
  const { data, error } = await supabase
    .from('configuracion')
    .select('valore')
    .eq('clave', 'link_whatsapp')
    .single();

  if (error || !data) {
    console.error('Error al cargar link WhatsApp', error);
    return;
  }

  const btn = document.getElementById('btnWhatsapp');
  btn.href = data.valore;
  btn.style.display = 'inline-block';
}

function cerrarTerminos() {
  document.getElementById('modal-terminos').classList.add('oculto');
}

async function guardarLinkYoutube() {
  const link = document.getElementById("inputYoutube").value;
  const { error } = await supabase
    .from("configuracion")
    .update({ valore: link })
    .eq("clave", "youtube_live");

  if (error) {
    alert("Error al guardar el enlace: " + error.message);
  } else {
    alert("Enlace de YouTube guardado exitosamente.");
  }
}

async function cargarConfiguracionModoCartones() {
  const { data: modoData, error: modoError } = await supabase
    .from('configuracion')
    .select('valore')
    .eq('clave', 'modo_cartones')
    .single();

  if (!modoError && modoData) {
    modoCartones = modoData.valore;
  }

  if (modoCartones === "fijo") {
    const { data: cantData, error: cantError } = await supabase
      .from('configuracion')
      .select('valore')
      .eq('clave', 'cartones_obligatorios')
      .single();

    if (!cantError && cantData) {
      cantidadFijaCartones = parseInt(cantData.valore) || 1;
      document.getElementById('cantidadCartones').value = cantidadFijaCartones;
      document.getElementById('btnMas').disabled = true;
      document.getElementById('btnMenos').disabled = true;
      document.getElementById('cantidadCartones').readOnly = true;
    }
  } else {
    document.getElementById('btnMas').disabled = false;
    document.getElementById('btnMenos').disabled = false;
    document.getElementById('cantidadCartones').readOnly = false;
  }
}

async function cargarModoCartonesAdmin() {
  const { data: modoData } = await supabase
    .from('configuracion')
    .select('valore')
    .eq('clave', 'modo_cartones')
    .single();

  if (modoData) {
    document.getElementById('modoCartonesSelect').value = modoData.valore;
  }

  if (modoData && modoData.valore === 'fijo') {
    const { data: cantData } = await supabase
      .from('configuracion')
      .select('valore')
      .eq('clave', 'cartones_obligatorios')
      .single();

    if (cantData) {
      document.getElementById('cantidadCartonesFijos').value = cantData.valore;
    }
    document.getElementById('contenedorCartonesFijos').style.display = 'block';
  } else {
    document.getElementById('contenedorCartonesFijos').style.display = 'none';
  }
}

function cambiarModoCartones() {
  const modo = document.getElementById('modoCartonesSelect').value;
  const contenedor = document.getElementById('contenedorCartonesFijos');
  contenedor.style.display = (modo === 'fijo') ? 'block' : 'none';
  
  if (modo === 'fijo') {
    const cantidad = document.getElementById('cantidadCartonesFijos').value || 1;
    document.getElementById('btnMas').disabled = true;
    document.getElementById('btnMenos').disabled = true;
    document.getElementById('cantidadCartones').readOnly = true;
  } else {
    document.getElementById('btnMas').disabled = false;
    document.getElementById('btnMenos').disabled = false;
    document.getElementById('cantidadCartones').readOnly = false;
  }
}

async function guardarModoCartones() {
  const modo = document.getElementById('modoCartonesSelect').value;
  const cantidad = parseInt(document.getElementById('cantidadCartonesFijos').value);

  const updates = [
    { clave: 'modo_cartones', valore: modo }
  ];

  if (modo === 'fijo') {
    if (isNaN(cantidad) || cantidad < 1) {
      return alert('Cantidad fija inválida');
    }
    updates.push({ clave: 'cartones_obligatorios', valore: cantidad });
  }

  const { error } = await supabase
    .from('configuracion')
    .upsert(updates, { onConflict: 'clave' });

  if (error) {
    alert('Error guardando configuración');
    console.error(error);
  } else {
    alert('Modo actualizado correctamente');
    await cargarConfiguracionModoCartones();
  }
}

async function guardarGanador() {
  const nombre   = document.getElementById('ganadorNombre').value.trim();
  const cedula   = document.getElementById('ganadorCedula').value.trim();
  const cartones = document.getElementById('ganadorCartones').value.trim();
  const premio   = document.getElementById('ganadorPremio').value.trim();
  const telefono  = document.getElementById('ganadorTelefono').value.trim();
  const fecha    = document.getElementById('ganadorFecha').value.trim();

  if (!nombre || !cedula || !cartones || !premio || !telefono|| !fecha) {
    return alert("Completa todos los campos del ganador.");
  }

  const { error } = await supabase
    .from('ganadores')
    .insert([{ nombre, cedula, cartones, premio, telefono, fecha }]);

  if (error) {
    console.error(error);
    alert("Error al guardar el ganador.");
  } else {
    alert("¡Ganador guardado correctamente!");
    document.getElementById('formularioGanador').reset();
    cargarGanadores();
  }
}

async function cargarGanadores() {
  const { data, error } = await supabase
    .from('ganadores')
    .select('*')
    .order('id', { ascending: false });

  const contenedor = document.getElementById('listaGanadores');
  contenedor.innerHTML = '';

  if (error || !data.length) {
    contenedor.innerHTML = '<p>No hay ganadores registrados aún.</p>';
    return;
  }

  const tabla = document.createElement('table');
  tabla.style.width = '100%';
  tabla.innerHTML = `
    <thead>
      <tr>
        <th>Nombre</th>
        <th>Cédula</th>
        <th>Cartones</th>
        <th>Premio</th>
        <th>Telefono</th>
        <th>Fecha</th>
      </tr>
    </thead>
    <tbody>
      ${data.map(g => `
        <tr>
          <td>${g.nombre}</td>
          <td>${g.cedula}</td>
          <td>${g.cartones}</td>
          <td>${g.premio}</td>
          <td>${g.telefono}</td>
          <td>${g.fecha || ''}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
  contenedor.appendChild(tabla);
}

function toggleFormularioGanador() {
  const contenedor = document.getElementById('formularioGanadorContenedor');
  contenedor.style.display = contenedor.style.display === 'none' ? 'block' : 'none';
}

async function activarCohetes() {
  const { error } = await supabase
    .from('configuracion')
    .update({ valore: true })
    .eq('clave', 'cohetes_activados');

  if (error) {
    alert("Error activando cohetes");
  } else {
    alert("¡Cohetes activados!");
  }
}

function ordenarInscripcionesPorNombre() {
  const tabla = document.querySelector('#tabla-comprobantes tbody');
  const filas = Array.from(tabla.rows);

  filas.sort((a, b) => {
    const nombreA = a.cells[0].textContent.trim().toLowerCase();
    const nombreB = b.cells[0].textContent.trim().toLowerCase();
    return nombreA.localeCompare(nombreB);
  });

  tabla.innerHTML = '';
  filas.forEach(fila => tabla.appendChild(fila));
}

let ordenCedulaAscendente = true;

function ordenarPorCedula() {
  const tabla = document.querySelector('#tabla-comprobantes tbody');
  const filas = Array.from(tabla.rows);

  filas.sort((a, b) => {
    const cedulaA = parseInt(a.cells[2].textContent.trim());
    const cedulaB = parseInt(b.cells[2].textContent.trim());
    return ordenCedulaAscendente ? cedulaA - cedulaB : cedulaB - cedulaA;
  });

  tabla.innerHTML = '';
  filas.forEach(fila => tabla.appendChild(fila));
  ordenCedulaAscendente = !ordenCedulaAscendente;
}

let ordenReferenciaAscendente = false;
function ordenarPorReferencia() {
  const tabla = document.querySelector('#tabla-comprobantes tbody');
  const filas = Array.from(tabla.rows);

  filas.sort((a, b) => {
    const refA = a.cells[5].textContent.trim();
    const refB = b.cells[5].textContent.trim();
    const numA = parseInt(refA) || 0;
    const numB = parseInt(refB) || 0;
    return ordenReferenciaAscendente ? numA - numB : numB - numA;
  });

  tabla.innerHTML = '';
  filas.forEach(fila => tabla.appendChild(fila));
  ordenReferenciaAscendente = !ordenReferenciaAscendente;
}

function buildWhatsAppLink(rawPhone, presetMsg = '') {
  if (!rawPhone) return null;

  let s = String(rawPhone).trim().replace(/[\s\-\.\(\)]/g, '');

  if (s.startsWith('00')) s = '+' + s.slice(2);

  if (!s.startsWith('+')) {
    const digits = s.replace(/\D+/g, '');
    const m = /^(0?)(412|414|416|424|426)(\d{7})$/.exec(digits);
    if (m) {
      s = '+58' + m[2] + m[3];
    } else {
      s = '+' + digits;
    }
  }

  const waNumber = s.replace(/^\+/, '');
  const text = encodeURIComponent(presetMsg || 'Hola, te escribo de parte del equipo de bingoandino75.');
  return `https://wa.me/${waNumber}?text=${text}`;
}

async function fetchTodosLosOcupados() {
  const pageSize = 1000;
  let from = 0;
  let todos = [];

  const { count, error: countErr } = await supabase
    .from('cartones')
    .select('numero', { count: 'exact', head: true });

  if (countErr) {
    console.error('Error contando cartones:', countErr);
    return [];
  }

  const total = count || 0;
  while (from < total) {
    const to = Math.min(from + pageSize - 1, total - 1);
    const { data, error } = await supabase
      .from('cartones')
      .select('numero')
      .order('numero', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('Error paginando cartones:', error);
      break;
    }

    todos = todos.concat(data || []);
    from += pageSize;
  }

  return todos.map(r => Number(r.numero));
}

function restringirSolo4Digitos(input) {
  input.value = input.value.replace(/\D+/g, '').slice(0, 4);
}

function editarReferencia(td) {
  const id   = td.getAttribute('data-id');
  const prev = (td.querySelector('.ref-text')?.textContent || '').trim();

  td.innerHTML = `
    <input class="ref-input" type="text" maxlength="4" value="${prev}">
    <button class="btn-mini btn-guardar">Guardar</button>
    <button class="btn-mini btn-cancelar">Cancelar</button>
  `;

  const inp     = td.querySelector('.ref-input');
  const btnOk   = td.querySelector('.btn-guardar');
  const btnCancel = td.querySelector('.btn-cancelar');

  inp.addEventListener('input', () => restringirSolo4Digitos(inp));
  inp.focus();
  inp.select();

  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnOk.click();
    if (e.key === 'Escape') btnCancel.click();
  });

  btnOk.onclick = async () => {
    const val = (inp.value || '').trim();
    if (!/^\d{4}$/.test(val)) {
      alert('La referencia debe tener exactamente 4 dígitos (0000–9999).');
      inp.focus();
      return;
    }

    const { error } = await supabase
      .from('inscripciones')
      .update({ referencia4dig: val })
      .eq('id', id);

    if (error) {
      console.error(error);
      alert('No se pudo guardar la referencia.');
      return;
    }

    td.innerHTML = `
      <span class="ref-text">${val}</span>
      <button class="btn-accion btn-edit-ref" title="Editar">&#9998;</button>
    `;
    td.querySelector('.btn-edit-ref').onclick = () => editarReferencia(td);
  };

  btnCancel.onclick = () => {
    td.innerHTML = `
      <span class="ref-text">${prev}</span>
      <button class="btn-accion btn-edit-ref" title="Editar">&#9998;</button>
    `;
    td.querySelector('.btn-edit-ref').onclick = () => editarReferencia(td);
  };
}

function normalizarNombre(s='') {
  return String(s)
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function solo4Digitos(s='') {
  const t = String(s).replace(/\D+/g, '').slice(0,4);
  return /^\d{4}$/.test(t) ? t : '';
}

async function fetchAprobadosBasico() {
  const { data, error } = await supabase
    .from('inscripciones')
    .select('id,nombre,cedula,telefono,cartones,referencia4dig')
    .eq('estado','aprobado');
  if (error) {
    console.error('Error cargando aprobados:', error);
    alert('No se pudieron cargar los aprobados.');
    return [];
  }
  return data || [];
}

function renderDuplicadosAprobados(lista, tipoClave) {
  const cont = document.getElementById('duplicadosAprobadosResultado');
  if (!cont) return;
  cont.innerHTML = '';

  if (!lista.length) {
    cont.innerHTML = `<p style="color:#4caf50;font-weight:600;">No se encontraron duplicados por ${tipoClave} entre los aprobados.</p>`;
    return;
  }

  const tbl = document.createElement('table');
  tbl.className = 'dup-table';
  tbl.style.width = '100%';
  tbl.style.borderCollapse = 'collapse';
  tbl.innerHTML = `
    <thead>
      
       <tr style="background-color:#FFA500; color:#000;">
        <th>${tipoClave === 'nombre' ? 'Nombre (normalizado)' : 'Referencia (4 dígitos)'}</th>
        <th>Veces</th>
        <th>Personas</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = tbl.querySelector('tbody');

  lista.forEach(g => {
    const tr = document.createElement('tr');
    tr.style.backgroundColor = tipoClave === 'nombre' ? '#ffe0e0' : '#e0ffe0'; // fondo rojo claro para nombre, verde para referencia
    tr.style.color = '#000'; // texto negro
    tr.style.borderBottom = '1px solid #ddd';

    const personasTxt = g.items.map(x => {
      const carts = Array.isArray(x.cartones) ? x.cartones.join(', ') : '';
      return `${x.nombre} (CI: ${x.cedula})${x.telefono ? ' – ' + x.telefono : ''}${carts ? ' – Cartones: ' + carts : ''}`;
    }).join(' | ');
    tr.innerHTML = `
      <td>${g.clave}</td>
      <td>${g.items.length}</td>
      <td>${personasTxt}</td>
    `;
    tbody.appendChild(tr);
  });

  cont.appendChild(tbl);
}

async function detectarDuplicadosAprobadosPorNombre() {
  const rows = await fetchAprobadosBasico();
  const mapa = new Map();
  rows.forEach(r => {
    const k = normalizarNombre(r.nombre);
    if (!k) return;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(r);
  });
  
  const duplicados = [];
  const dupSet = new Set();
  for (const [k, arr] of mapa.entries()) {
    if (arr.length > 1) {
      duplicados.push({ clave: k, items: arr });
      dupSet.add(k);
    }
  }
  
  duplicados.sort((a,b) => (b.items.length - a.items.length) || a.clave.localeCompare(b.clave));
  renderDuplicadosAprobados(duplicados, 'nombre');
}

async function detectarDuplicadosAprobadosPorReferencia() {
  const rows = await fetchAprobadosBasico();
  const mapa = new Map();
  rows.forEach(r => {
    const ref = solo4Digitos(r.referencia4dig);
    if (!ref) return;
    if (!mapa.has(ref)) mapa.set(ref, []);
    mapa.get(ref).push(r);
  });
  
  const duplicados = [];
  for (const [ref, arr] of mapa.entries()) {
    if (arr.length > 1) duplicados.push({ clave: ref, items: arr });
  }
  
  duplicados.sort((a,b) => (b.items.length - a.items.length) || (a.clave.localeCompare(b.clave)));
  renderDuplicadosAprobados(duplicados, 'referencia');
}

function imprimirLista() {
  const lista = document.getElementById('listaAprobados');
  if (!lista.innerHTML.trim()) {
    alert('Primero debes generar la lista de aprobados.');
    return;
  }
  window.print();
}

// ==================== FUNCIONES FALTANTES ====================
async function subirCartones() {
  const input = document.getElementById('cartonImageInput');
  const files = input.files;
  const status = document.getElementById('uploadStatus');
  status.innerHTML = '';

  if (!files.length) {
    alert('Selecciona al menos una imagen');
    return;
  }

  status.innerHTML = '<p style="color:blue;">Cargando imágenes...</p>';

  const errores = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileName = file.name;

    try {
      const { error } = await supabase.storage
        .from('cartones')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) {
        errores.push(`Error subiendo ${fileName}: ${error.message}`);
      }
    } catch (err) {
      errores.push(`Error inesperado en ${fileName}`);
    }
  }

  input.value = '';

  if (errores.length) {
    status.innerHTML = `<p style="color:red;">Se encontraron errores:</p><ul>${errores.map(e => `<li>${e}</li>`).join('')}</ul>`;
  } else {
    status.innerHTML = '<p style="color:green;">¡Todas las imágenes fueron subidas exitosamente!</p>';
  }

  setTimeout(() => { status.innerHTML = ''; }, 5000);
}

async function borrarCartones() {
  const { data: claveData, error: claveError } = await supabase
    .from('configuracion')
    .select('valore')
    .eq('clave', 'clave_borrar_cartones')
    .single();

  if (claveError || !claveData) {
    alert("Error al obtener la clave de seguridad. Contacta al administrador.");
    console.error('Error obteniendo clave:', claveError);
    return;
  }

  const claveCorrecta = claveData.valore;
  const claveIngresada = prompt("Ingrese la clave de seguridad para borrar todos los cartones:");

  if (!claveIngresada) {
    alert("Operación cancelada.");
    return;
  }

  if (claveIngresada.trim() !== claveCorrecta.trim()) {
    alert("Clave incorrecta. No se borraron los cartones.");
    return;
  }

  if (!confirm("⚠️ ¿ESTÁS ABSOLUTAMENTE SEGURO?\n\nEsta acción borrará TODAS las imágenes de cartones.\n\nEsto NO se puede deshacer.")) {
    alert("Operación cancelada.");
    return;
  }

  const status = document.getElementById('deleteStatus');
  status.innerHTML = '<p style="color:blue;">Cargando lista de imágenes...</p>';

  try {
    const { data: list, error: listError } = await supabase.storage
      .from('cartones')
      .list('', { limit: 1000 });

    if (listError) throw listError;

    if (!list || list.length === 0) {
      status.innerHTML = '<p style="color:orange;">No hay imágenes para borrar.</p>';
      setTimeout(() => { status.innerHTML = ''; }, 3000);
      return;
    }

    const fileNames = list.map(file => file.name);
    const { error: deleteError } = await supabase.storage
      .from('cartones')
      .remove(fileNames);

    if (deleteError) throw deleteError;

    status.innerHTML = `<p style="color:green;">✅ Se borraron ${fileNames.length} imágenes exitosamente.</p>`;
    
  } catch (error) {
    console.error('Error borrando cartones:', error);
    status.innerHTML = `<p style="color:red;">❌ Error al borrar imágenes: ${error.message}</p>`;
  }

  setTimeout(() => {
    status.innerHTML = '';
  }, 5000);
}

// ==================== FUNCIÓN entrarAdmin ====================
async function entrarAdmin() {
  // Verificar si ya tiene sesión válida
  const sessionToken = sessionStorage.getItem('admin_session_token');
  
  if (sessionToken && await verificarSesionAdmin()) {
    // Ya tiene sesión válida
    const email = sessionStorage.getItem('admin_email');
    adminSession = { email, token: sessionToken };
    sesionActiva = true;
    
    document.getElementById('admin-email-display').textContent = email;
    mostrarPanelAdminSeguro(sessionToken);
    iniciarDetectorActividad();
    resetInactivityTimer();
    
    return;
  }
  
  // No tiene sesión, mostrar login
  mostrarVentana('admin-login');
  
  // Limpiar campos
  document.getElementById('admin-email').value = '';
  document.getElementById('admin-password').value = '';
  document.getElementById('admin-error').textContent = '';
}
// ==================== FUNCIÓN PARA RECUPERAR PASSWORD ====================
async function recuperarPasswordAdmin() {
  const email = ADMIN_EMAIL;
  
  if (!confirm(`¿Enviar enlace de recuperación a ${email}?`)) {
    return;
  }
  
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password.html`,
    });
    
    if (error) throw error;
    
    alert('✅ Enlace de recuperación enviado a tu email');
    
  } catch (error) {
    console.error('Error recuperando password:', error);
    alert('❌ Error enviando enlace de recuperación');
  }
}

// ==================== AGREGAR BOTONES ADICIONALES ====================
function agregarBotonesAdicionalesAdmin() {
  const loginSection = document.getElementById('admin-login');
  if (!loginSection) return;
  
  if (!document.getElementById('botones-adicionales-admin')) {
    const botonesHTML = `
      <div id="botones-adicionales-admin" style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee;">
        <button onclick="forzarCerrarSesionRemota()" style="background: #ff6b6b; color: white; padding: 8px 12px; border: none; border-radius: 4px; margin-right: 10px;">
          🔓 Forzar cierre remoto
        </button>
        <button onclick="recuperarPasswordAdmin()" style="background: #6c5ce7; color: white; padding: 8px 12px; border: none; border-radius: 4px;">
          🔑 Recuperar contraseña
        </button>
      </div>
    `;
    
    loginSection.insertAdjacentHTML('beforeend', botonesHTML);
  }
}
let canalInscripciones = null;

function activarRefrescoAutomaticoAdmin() {
  if (canalInscripciones) return;

  canalInscripciones = supabase
    .channel('admin-inscripciones-realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'inscripciones'
      },
      async (payload) => {
        console.log('🔄 Cambio detectado en inscripciones:', payload);

        if (sesionActiva && !document.getElementById('admin-panel').classList.contains('oculto')) {
          await cargarPanelAdmin();
        }
      }
    )
    .subscribe();
}
let timerReserva = null;

function iniciarContadorReserva(minutos = 5) {
  const div = document.getElementById('contadorReserva');

  let restante = minutos * 60;

  clearInterval(timerReserva);

  timerReserva = setInterval(() => {

    const min = Math.floor(restante / 60);
    const seg = restante % 60;

    div.innerHTML =
      `⏳ Reserva activa: ${min}:${seg.toString().padStart(2,'0')}`;

    if (restante <= 60) {
      div.style.background = 'rgba(239,71,111,.2)';
      div.style.borderColor = '#ef476f';
    }

    if (restante <= 0) {
      clearInterval(timerReserva);

      div.innerHTML =
        '⛔ Tiempo agotado. Los cartones fueron liberados.';

      liberarReservaPorTiempo();
    }

    restante--;

  }, 1000);
}
async function liberarReservaPorTiempo() {

  try {

    await supabase.rpc('rpc_liberar_reserva', {
      _cedula: usuario.cedula,
      _partida_id: null
    });

    usuario.cartones = [];

    alert(
      'Tu tiempo para enviar el comprobante expiró. Debes seleccionar nuevamente tus cartones.'
    );

    mostrarSeccion('cartones');

    await cargarCartones();

  } catch (err) {
    console.error(err);
  }
}
async function cargarTopCompradores() {
  const { data, error } = await supabase
    .from('inscripciones')
    .select('nombre, cedula, telefono, cartones, estado')
    .in('estado', ['aprobado']);

  const cont = document.getElementById('listaTopCompradores');
  cont.innerHTML = '';

  if (error) {
    console.error(error);
    cont.innerHTML = '<p>Error cargando top compradores.</p>';
    return;
  }

  const ranking = {};

  (data || []).forEach(item => {
    const cedula = item.cedula || 'sin-cedula';
    const cantidad = Array.isArray(item.cartones) ? item.cartones.length : 0;

    if (!ranking[cedula]) {
      ranking[cedula] = {
        nombre: item.nombre || 'Sin nombre',
        cedula,
        telefono: item.telefono || '',
        total: 0
      };
    }

    ranking[cedula].total += cantidad;
  });

  const top = Object.values(ranking)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  if (!top.length) {
    cont.innerHTML = '<p>No hay compradores todavía.</p>';
    return;
  }

  cont.innerHTML = `
    <ol class="top-compradores-lista">
      ${top.map((p, i) => `
        <li>
          <strong>#${i + 1} ${p.nombre}</strong><br>
          Cédula: ${p.cedula}<br>
          Cartones comprados: <strong>${p.total}</strong>
        </li>
      `).join('')}
    </ol>
  `;
}

let canalTopCompradores = null;

function activarTopCompradoresRealtime() {
  if (canalTopCompradores) return;

  canalTopCompradores = supabase
    .channel('top-compradores-realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'inscripciones'
      },
      async () => {
        const seccion = document.getElementById('top-compradores');

        if (seccion && !seccion.classList.contains('oculto')) {
          await cargarTopCompradores();
        }
      }
    )
    .subscribe();
}
async function subirImagenPremiosInicio() {
  const input = document.getElementById('inputPremiosInicio');
  const estado = document.getElementById('estadoPremiosInicio');
  const archivo = input.files[0];

  if (!archivo) return alert('Selecciona una imagen');

  const ext = archivo.name.split('.').pop();
  const nombreArchivo = `premios-inicio-${Date.now()}.${ext}`;

  estado.textContent = 'Subiendo...';

  const { error: uploadError } = await supabase.storage
    .from('imagenes')
    .upload(nombreArchivo, archivo, { upsert: true });

  if (uploadError) {
    estado.textContent = 'Error subiendo imagen';
    console.error(uploadError);
    return;
  }

  const url = `${supabaseUrl}/storage/v1/object/public/imagenes/${nombreArchivo}`;

  const { error } = await supabase
    .from('configuracion')
    .upsert([{ clave: 'imagen_premios_inicio', valore: url }], { onConflict: 'clave' });

  if (error) {
    estado.textContent = 'Error guardando imagen';
    console.error(error);
    return;
  }

  estado.textContent = '✅ Imagen guardada';
  await cargarImagenPremiosInicio();
}

async function cargarImagenPremiosInicio() {
  const img = document.getElementById('imagenPremiosInicio');
  if (!img) return;

  const { data, error } = await supabase
    .from('configuracion')
    .select('valore')
    .eq('clave', 'imagen_premios_inicio')
    .single();

  if (error || !data?.valore) {
    img.classList.add('oculto');
    return;
  }

  img.src = data.valore;
  img.classList.remove('oculto');
}

window.subirImagenPremiosInicio = subirImagenPremiosInicio;

async function eliminarImagenPremiosInicio() {
  if (!confirm('¿Eliminar la imagen de premios?')) return;

  try {
    const { data } = await supabase
      .from('configuracion')
      .select('valore')
      .eq('clave', 'imagen_premios_inicio')
      .single();

    if (data?.valore) {
      const nombreArchivo = data.valore.split('/').pop();

      await supabase.storage
        .from('imagenes')
        .remove([nombreArchivo]);
    }

    await supabase
      .from('configuracion')
      .update({ valore: null })
      .eq('clave', 'imagen_premios_inicio');

    const img = document.getElementById('imagenPremiosInicio');

    if (img) {
      img.src = '';
      img.classList.add('oculto');
    }

    alert('Imagen eliminada correctamente');

  } catch (err) {
    console.error(err);
    alert('Error eliminando imagen');
  }
}

window.eliminarImagenPremiosInicio = eliminarImagenPremiosInicio;

async function cargarBarraProgresoInicio() {
  const contenedor = document.getElementById('barraProgresoInicio');
  const texto = document.getElementById('textoProgresoCartones');
  const relleno = document.getElementById('rellenoProgresoCartones');

  if (!contenedor || !texto || !relleno) return;

  const mostrar = await getConfigValue('mostrar_barra_progreso', 'false');

  if (mostrar !== 'true') {
    contenedor.classList.add('oculto');
    return;
  }

  await obtenerTotalCartones();

  const vendidos = await contarCartonesVendidos();
  const disponibles = Math.max(totalCartones - vendidos, 0);
  const porcentaje = totalCartones > 0
    ? Math.round((disponibles / totalCartones) * 100)
    : 0;

  texto.textContent = `${porcentaje}% disponibles · ${disponibles} de ${totalCartones} cartones`;

  relleno.style.width = `${porcentaje}%`;
  contenedor.classList.remove('oculto');
}

async function guardarConfigBarraProgreso() {
  const check = document.getElementById('toggleBarraProgreso');
  if (!check) return;

  const valor = check.checked ? 'true' : 'false';

  const ok = await setConfigValue('mostrar_barra_progreso', valor);

  if (ok) {
    alert('Configuración guardada');
    await cargarBarraProgresoInicio();
  } else {
    alert('Error guardando configuración');
  }
}

async function cargarConfigBarraProgresoAdmin() {
  const check = document.getElementById('toggleBarraProgreso');
  if (!check) return;

  const valor = await getConfigValue('mostrar_barra_progreso', 'false');
  check.checked = valor === 'true';
}
let canalProgresoCartones = null;

function activarProgresoCartonesRealtime() {
  if (canalProgresoCartones) return;

  canalProgresoCartones = supabase
    .channel('progreso-cartones-inicio')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'cartones'
      },
      async () => {
        await cargarBarraProgresoInicio();
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'configuracion'
      },
      async (payload) => {
        if (
          payload.new?.clave === 'mostrar_barra_progreso' ||
          payload.new?.clave === 'total_cartones'
        ) {
          await cargarBarraProgresoInicio();
        }
      }
    )
    .subscribe();
}
// Función para seleccionar cartones aleatorios
async function seleccionarAleatorioSeguro() {
  const faltan = cantidadPermitida - usuario.cartones.length;

  if (faltan <= 0) {
    alert('Ya seleccionaste todos los cartones permitidos.');
    return;
  }

  const { data, error } = await supabase.rpc('rpc_reservar_cartones_aleatorios', {
    _cantidad: faltan,
    _cedula: usuario.cedula,
    _partida_id: null
  });

  if (error) {
    console.error(error);
    alert('Error eligiendo cartones aleatorios.');
    return;
  }

  const resultado = Array.isArray(data) ? data[0] : data;

  if (!resultado?.exito) {
    alert(resultado?.mensaje || 'No se pudieron reservar cartones.');
    await cargarCartones();
    return;
  }

  usuario.cartones.push(...resultado.cartones);

  await cargarCartones();

  usuario.cartones.forEach(num => {
    const carton = [...document.querySelectorAll('.carton')]
      .find(c => parseInt(c.textContent) === num);

    if (carton) {
      carton.classList.remove('ocupado');
      carton.classList.add('seleccionado');
      carton.onclick = () => toggleCarton(num, carton);
    }
  });
  if (usuario.cartones.length >= cantidadPermitida) {
  document.querySelectorAll('.carton').forEach(c => {
    const n = parseInt(c.textContent);
    const yaSeleccionado = usuario.cartones.includes(n);
    const yaOcupado = cartonesOcupados.includes(n);

    if (!yaSeleccionado && !yaOcupado) {
      c.classList.add('bloqueado');

    } else if (yaSeleccionado) {
      // Si está seleccionado, asegurarse que el onclick siga llamando toggleCarton
      c.onclick = () => toggleCarton(n, c);
    }
  });
}

  actualizarContadorCartones(totalCartones, cartonesOcupados.length, usuario.cartones.length);
  actualizarMonto();

  alert(`Cartones seleccionados: ${resultado.cartones.join(', ')}`);
}

window.seleccionarAleatorioSeguro = seleccionarAleatorioSeguro;



function guardarDatosClienteLocal() {
  localStorage.setItem('cliente_nombre', usuario.nombre || '');
  localStorage.setItem('cliente_telefono', usuario.telefono || '');
  localStorage.setItem('cliente_cedula', usuario.cedula || '');
  localStorage.setItem('cliente_referido', usuario.referido || '');
}

function cargarDatosClienteLocal() {
  const nombre = localStorage.getItem('cliente_nombre') || '';
  const telefono = localStorage.getItem('cliente_telefono') || '';
  const cedula = localStorage.getItem('cliente_cedula') || '';
  const referido = localStorage.getItem('cliente_referido') || '';

  if (document.getElementById('nombre')) document.getElementById('nombre').value = nombre;
  if (document.getElementById('telefono')) document.getElementById('telefono').value = telefono;
  if (document.getElementById('cedula')) document.getElementById('cedula').value = cedula;
  if (document.getElementById('referido')) document.getElementById('referido').value = referido;
}

function copiarDatoPago(id) {
  const texto = document.getElementById(id).textContent.trim();

  navigator.clipboard.writeText(texto)
    .then(() => mostrarToastPago('✅ Copiado'))
    .catch(() => alert('No se pudo copiar'));
}

function mostrarToastPago(mensaje) {
  const toast = document.createElement('div');
  toast.className = 'toast-pago';
  toast.textContent = mensaje;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 1800);
}

function cargarDatosPagoCliente() {
  const datos = JSON.parse(localStorage.getItem('pago_movil_cliente') || '{}');

  const banco = document.getElementById('pago_banco');
  const telefono = document.getElementById('pago_telefono');
  const cedula = document.getElementById('pago_cedula');

  if (!banco || !telefono || !cedula) return;

  banco.value = datos.banco || '';
  telefono.value = datos.telefono || '';
  cedula.value = datos.cedula || '';

  [banco, telefono, cedula].forEach(input => {
    input.addEventListener('input', guardarDatosPagoClienteAutomatico);
  });
}

function guardarDatosPagoClienteAutomatico() {
  const datos = {
    banco: document.getElementById('pago_banco').value.trim(),
    telefono: document.getElementById('pago_telefono').value.trim(),
    cedula: document.getElementById('pago_cedula').value.trim()
  };

  localStorage.setItem('pago_movil_cliente', JSON.stringify(datos));
}

document.addEventListener('DOMContentLoaded', cargarDatosPagoCliente);


function copiarPagoMovil(banco, telefono, cedula) {
  const texto =
`Banco: ${banco}
Teléfono: ${telefono}
Cédula: ${cedula}`;

  navigator.clipboard.writeText(texto)
    .then(() => alert('✅ Datos copiados'))
    .catch(() => alert('❌ Error al copiar'));
}

function copiarTodoPagoMovil() {
    const banco = document.getElementById('adminPagoBanco')?.textContent || '';
  const telefono = document.getElementById('adminPagoTelefono')?.textContent || '';
  const cedula = document.getElementById('adminPagoCedula')?.textContent || '';
  const monto = document.getElementById('monto-pago')?.textContent || '';

  const texto = ` ${banco}
 ${telefono}
 ${cedula}
 ${monto} `;

  navigator.clipboard.writeText(texto)
    .then(() => alert('✅ Todos los datos de pago copiados al portapapeles'))
    .catch(() => alert('❌ Error al copiar'));
}
// ─── NAEGACIÓN POR PESTAÑAS DEL ADMIN ───
function cambiarTab(tabId) {
  // Ocultar todos los contenidos
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Desactivar todos los botones
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Activar el seleccionado
  document.getElementById(tabId).classList.add('active');
  event.target.classList.add('active');
}

// ==================== EXPORTAR FUNCIONES ====================
window.mostrarVentana = mostrarVentana;
window.guardarDatosInscripcion = guardarDatosInscripcion;
window.confirmarCantidad = confirmarCantidad;
window.enviarComprobante = enviarComprobante;
window.consultarCartones = consultarCartones;
window.elegirMasCartones = elegirMasCartones;
window.entrarAdmin = entrarAdmin;
window.loginAdmin = loginAdmin;
window.toggleCarton = toggleCarton;
window.abrirModalCarton = abrirModalCarton;
window.cerrarModalCarton = cerrarModalCarton;
window.seleccionarPromocion = seleccionarPromocion;
window.deseleccionarPromocion = deseleccionarPromocion;
window.cerrarTerminos = cerrarTerminos;
window.toggleFormularioGanador = toggleFormularioGanador;
window.guardarGanador = guardarGanador;
window.ordenarInscripcionesPorNombre = ordenarInscripcionesPorNombre;
window.ordenarPorCedula = ordenarPorCedula;
window.ordenarPorReferencia = ordenarPorReferencia;
window.activarCohetes = activarCohetes;
window.mostrarSeccion = mostrarSeccion;
window.verificarOTP = verificarOTP;
window.cancelarOTP = cancelarOTP;
window.reenviarOTP = reenviarOTP;
window.forzarCerrarSesionRemota = forzarCerrarSesionRemota;
window.recuperarPasswordAdmin = recuperarPasswordAdmin;

console.log('✅ Sistema de sesión única configurado correctamente');
