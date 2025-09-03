const supabaseUrl = 'https://dbkixcpwirjwjvjintkr.supabase.co';
const supabase = window.supabase.createClient(supabaseUrl, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRia2l4Y3B3aXJqd2p2amludGtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwNjYxNDksImV4cCI6MjA2MTY0MjE0OX0.QJmWLWSe-pRYwxWeel8df7JLhNUvMKaTpL0MCDorgho');

// Variables globales
let cartonesOcupados = [];
let precioPorCarton = 0;
let cantidadPermitida = 0;

let usuario = {
  nombre: '',
  telefono: '',
  cedula: '',
  referido: '',
  cartones: [],

};
window.addEventListener('DOMContentLoaded', async () => {
  await obtenerTotalCartones(); // lee desde Supabase
   await cargarPrecioPorCarton();
  await cargarConfiguracionModoCartones(); 
  generarCartones();// genera del 1 al totalCartones

});


let totalCartones = 0;
 
async function obtenerTotalCartones() {
  const { data, error } = await supabase
    .from('configuracion')
    .select('valore')
    .eq('clave', 'total_cartones')
    .single();

  if (!error && data) {
    totalCartones = parseInt(data.valore, 10) || 0;
  } else {
    totalCartones = 0; // fallback seguro
  }
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
function actualizarPreseleccion() {
  const cant = parseInt(document.getElementById('cantidadCartones').value) || 1;
  const maxDisponibles = totalCartones - cartonesOcupados.length;
  const cantidadValida = Math.min(cant, maxDisponibles);

  document.getElementById('cantidadCartones').value = cantidadValida;
  document.getElementById('monto-preseleccion').textContent =
    (cantidadValida * precioPorCarton).toFixed(2);
}

// botones + y −
document.getElementById('btnMas').onclick   = () => {
  document.getElementById('cantidadCartones').stepUp();
  actualizarPreseleccion();
};
document.getElementById('btnMenos').onclick = () => {
  document.getElementById('cantidadCartones').stepDown();
  actualizarPreseleccion();
};

// detectar tecleo manual
document.getElementById('cantidadCartones').addEventListener('input', actualizarPreseleccion);

function confirmarCantidad() {
  const cant = parseInt(document.getElementById('cantidadCartones').value);
  const maxDisponibles = totalCartones - cartonesOcupados.length;
  
  
  if (modoCartones === 'fijo') {
    if (cant !== cantidadFijaCartones) {
      return alert(`Debes seleccionar exactamente ${cantidadFijaCartones} cartones.`);
    }
  } else {
  if (isNaN(cant) || cant < 1) {
    return alert('Ingresa un número válido');
  }
  if (cant > maxDisponibles) {
    return alert(`Solo quedan ${maxDisponibles} cartones disponibles`);
  }
}
  cantidadPermitida   = cant;   // guardamos el tope
  usuario.cartones    = [];     // limpiamos selección anterior, si hubiera
  mostrarVentana('cartones');
   }
  

// Navegación entre secciones
async function mostrarVentana(id) {
  // Si es la sección de cartones, primero verificamos si las ventas están abiertas
  if (id === 'cartones') {
    const { data } = await supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'ventas_abierta')
      .single();

  if (!data || data.valor === false) {
  alert('Las ventas están cerradas');
  document.querySelectorAll('section').forEach(s => s.classList.add('oculto'));
  document.getElementById('bienvenida').classList.remove('oculto');
  return;
}
  }
 if (id === 'pago') {
    if (modoCartones === 'fijo') {
      if (usuario.cartones.length !== cantidadFijaCartones) {
        alert(`Debes elegir exactamente ${cantidadFijaCartones} cartones antes de continuar.`);
        return;
      }
    } else { // modo libre
      if (usuario.cartones.length !== cantidadPermitida) {
        alert(`Debes elegir exactamente ${cantidadPermitida} cartones antes de continuar.`);
        return;
      }
    }
  }
  // Ahora mostramos la ventana deseada
  document.querySelectorAll('section').forEach(s => s.classList.add('oculto'));
  document.getElementById(id).classList.remove('oculto');

  if (id === 'cartones') {
    cargarCartones();
 
  }
  if (id === 'pago') {
    document.getElementById('monto-pago').textContent = usuario.cartones.length * precioPorCarton;
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
}

// Cargar y mostrar cartones con imagen y modal
async function cargarCartones() {
  // 🔁 Trae TODOS los ocupados (en páginas de 1000)
  cartonesOcupados = await fetchTodosLosOcupados();
  const ocupadosSet = new Set(cartonesOcupados); // O(1) para la verificación

  const contenedor = document.getElementById('contenedor-cartones');
  contenedor.innerHTML = '';

  for (let i = 1; i <= totalCartones; i++) {
    const carton = document.createElement('div');
    carton.textContent = i;
    carton.classList.add('carton');

    if (ocupadosSet.has(i)) {
      carton.classList.add('ocupado');  // ← rojo
    } else {
      carton.onclick = () => abrirModalCarton(i, carton);
    }
    contenedor.appendChild(carton);
  }

  // contador real (sin límite 1000)
  await contarCartonesVendidos();
  actualizarContadorCartones(
    totalCartones,
    Number(document.getElementById('total-vendidos').textContent) || cartonesOcupados.length,
    usuario.cartones.length
  );
  actualizarMonto();
}



// Marcar/desmarcar cartones
function toggleCarton(num, elem) {
  const index = usuario.cartones.indexOf(num);

  // Deseleccionar
  if (index >= 0) {
    usuario.cartones.splice(index, 1);
    elem.classList.remove('seleccionado');

    // 🔓 Desbloquear solo los cartones bloqueados temporalmente (no los ocupados reales)
    document.querySelectorAll('.carton.bloqueado').forEach(c => {
      const n = parseInt(c.textContent);
      if (!cartonesOcupados.includes(n) && !usuario.cartones.includes(n)) {
        c.classList.remove('bloqueado');
        c.onclick = () => abrirModalCarton(n, c);
      }
    });

  } else {
    // Evita seleccionar más de los permitidos
    if (usuario.cartones.length >= cantidadPermitida) return;

    usuario.cartones.push(num);
    elem.classList.add('seleccionado');

    // 🔒 Si alcanzó el límite, bloquear el resto
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
  }
  actualizarContadorCartones(totalCartones, cartonesOcupados.length, usuario.cartones.length);
  actualizarMonto();
}
 
function actualizarMonto() {
  document.getElementById('monto-total').textContent = usuario.cartones.length * precioPorCarton;
}

// Subir comprobante y guardar en Supabase
async function enviarComprobante() {
  const boton = document.getElementById('btnEnviarComprobante');
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Cargando comprobante...';

  try {
    // Validaciones básicas...
    if (!usuario.nombre || !usuario.telefono || !usuario.cedula) {
      throw new Error('Debes completar primero los datos de inscripción');
    }

    const referencia4dig = document.getElementById('referencia4dig').value.trim();
    if (!/^\d{4}$/.test(referencia4dig)) {
      throw new Error('Debes ingresar los últimos 4 dígitos de la referencia bancaria.');
    }

    const archivo = document.getElementById('comprobante').files[0];
    if (!archivo) throw new Error('Debes subir un comprobante');

    // Subir comprobante
    const ext = archivo.name.split('.').pop();
    const nombreArchivo = `${usuario.cedula}-${Date.now()}.${ext}`;
    const { error: errorUpload } = await supabase.storage
      .from('comprobantes')
      .upload(nombreArchivo, archivo);
    if (errorUpload) throw new Error('Error subiendo imagen');

    const urlPublica = `${supabaseUrl}/storage/v1/object/public/comprobantes/${nombreArchivo}`;

    // -------- PASO CLAVE: reservar cartones primero --------
    // Intento insertar TODOS los cartones de una
    // (si hay uno duplicado, Postgres lanza conflicto y NO se crea la inscripción)
    const rows = usuario.cartones.map(n => ({ numero: n }));
    const { error: errInsertaCartones } = await supabase
      .from('cartones')
      .insert(rows);  // requiere UNIQUE en cartones.numero

    if (errInsertaCartones) {
      // Conflicto típico: errInsertaCartones.code === '23505'
      // (según versión puede venir en errInsertaCartones.details o message)
      alert('Uno o más cartones ya fueron tomados por otra persona. Elige otros, por favor.');
      // UX: volver a selección de cartones y refrescar estado
      usuario.cartones = [];
      mostrarVentana('cartones');
      await cargarCartones();
      return;
    }

    // Si llegamos aquí, los cartones SON NUESTROS ⇒ ahora guardamos inscripción
    const { error: errorInsert } = await supabase.from('inscripciones').insert([{
      nombre: usuario.nombre,
      telefono: usuario.telefono,
      cedula: usuario.cedula,
      referido: usuario.referido,
      cartones: usuario.cartones,
      referencia4dig: referencia4dig,
      comprobante: urlPublica,
      estado: 'pendiente'
    }]);

    if (errorInsert) {
      // Si falló la inscripción, liberamos cartones recién tomados para no dejarlos “fantasma”
      await supabase.from('cartones').delete().in('numero', usuario.cartones);
      throw new Error('Error guardando la inscripción');
    }

    alert('Inscripción y comprobante enviados con éxito');
    location.reload(); // o redirige a “pago” si quieres
  } catch (err) {
    console.error(err);
    alert(err.message || 'Ocurrió un error inesperado');
    // En caso de error, te asegurás de que el usuario NO vaya al admin,
    // y lo regresas a selección si venía de ahí:
    // (opcional) mostrarVentana('cartones');
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}
// Consultar cartones por cédula
async function consultarCartones() {
  const cedula = document.getElementById('consulta-cedula').value;
  const { data } = await supabase.from('inscripciones').select('*').eq('cedula', cedula);
  const cont = document.getElementById('cartones-usuario');
  cont.innerHTML = '';
  data.forEach(item => {
    item.cartones.forEach(num => {
      const img = document.createElement('img');
      img.src = `${supabaseUrl}/storage/v1/object/public/cartones/SERIAL_BINGOANDINO75_CARTON_${String(num).padStart(5, '0')}.jpg`;

      img.style.width = '100px';
      img.style.margin = '5px';
      cont.appendChild(img);
    });
  });
}
usuario.cartones = [];

// Entrar al panel admin
async function entrarAdmin() {
  const claveIngresada = document.getElementById("clave-admin").value;

  const { data: claveData, error: claveError } = await supabase
    .from('configuracion')
    .select('valore')
    .eq('clave', 'clave_admin')
    .single();

  if (claveError) {
    alert("Error consultando la clave.");
    return;
  }

  if (claveIngresada === claveData.valore) {
    document.getElementById("panel-admin").classList.remove("oculto");
    await cargarPanelAdmin();
  } else {
    alert("Clave incorrecta.");
  }

  // Mostrar panel si la clave es correcta
  
  obtenerMontoTotalRecaudado();
  contarCartonesVendidos();
obtenerMontoTotalRecaudado();
  
  contarCartonesVendidos();
document.getElementById('verListaBtn').addEventListener('click', async () => {
  const { data, error } = await supabase
    .from('inscripciones')
    .select('*')
    .eq('estado', 'aprobado'); // Cambia esto si tu campo se llama distinto

  const listaDiv = document.getElementById('listaAprobados');
  listaDiv.innerHTML = ''; // Limpiar antes de insertar

  if (error) {
    console.error('Error al obtener aprobados:', error);
    listaDiv.innerHTML = '<p>Error al obtener la lista.</p>';
    return;
  }

  if (data.length === 0) {
    listaDiv.innerHTML = '<p>No hay personas aprobadas.</p>';
    return;
  }
 // Mostrar la lista
// Crear tabla
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

  // Agregar cada aprobado como fila
  data.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="border: 1px solid #ccc; padding: 8px;">${item.nombre}</td>
      <td style="border: 1px solid #ccc; padding: 8px;">${item.cedula}</td>
      <td style="border: 1px solid #ccc; padding: 8px;">${item.referido}</td>
      <td style="border: 1px solid #ccc; padding: 8px;">
  <a href="${buildWhatsAppLink(item.telefono, `Hola ${item.nombre}, tu inscripción fue aprobada.`)}"
     target="_blank" rel="noopener">
    ${item.telefono}
  </a>
</td>

      <td style="border: 1px solid #ccc; padding: 8px;">${item.cartones.join(', ')}</td>
    `;
    tbody.appendChild(tr);
  });

  listaDiv.appendChild(tabla);
});

  // Traemos TODAS las inscripciones
  const { data, error } = await supabase
    .from('inscripciones')
    .select('*')
    .order('id', { ascending: false });

  if (error) {
    console.error(error);
    return alert('Error cargando inscripciones');
  }

  // Llenamos la tabla
  const tbody = document.querySelector('#tabla-comprobantes tbody');
  tbody.innerHTML = ''; // limpia antes de pintar

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
       <td>${item.referencia4dig || ''}</td>
      <td><a href="${item.comprobante}" target="_blank">
            <img src="${item.comprobante}" alt="Comp.">
          </a></td>
      <td>
        <span class="estado-circulo ${item.estado === 'aprobado' ? 'verde' : 'rojo'}"></span>
        <button class="btn-accion btn-aprobar" title="Aprobar">&#x2705;</button>
        <button class="btn-accion btn-rechazar" title="Rechazar">&#x274C;</button>
        <button class="btn-accion btn-eliminar" title="Eliminar">&#x1F5D1;</button>
      </td>
    `;

    // ===== acciones =====
    const btnAprobar  = tr.querySelector('.btn-aprobar');
    const btnRechazar = tr.querySelector('.btn-rechazar');
    const btnEliminar = tr.querySelector('.btn-eliminar');


    btnAprobar.onclick = () => aprobarInscripcion(item.id, tr);
    btnRechazar.onclick = () => rechazarInscripcion(item, tr);
    btnEliminar.onclick = () => eliminarInscripcion(item, tr);
    
    // Si la inscripción ya fue procesada, inhabilitamos los botones
    if (item.estado === 'aprobado') {
      btnAprobar.disabled = true;
      btnRechazar.disabled = true;
    } else if (item.estado === 'rechazado') {
      btnAprobar.disabled = true;
      btnRechazar.disabled = true;
    }

    tbody.appendChild(tr);
  });

  // Contadores
  document.getElementById('contadorCartones').innerText = 
  `Cartones disponibles: ${totalCartones - cartonesOcupados.length} de ${totalCartones}`;

  document.getElementById('contador-clientes').textContent = data.length;
}
document.getElementById('cerrarVentasBtn').addEventListener('click', async () => {
  const confirmacion = confirm("¿Estás seguro que quieres cerrar las ventas?");
  if (!confirmacion) return;

  const { error } = await supabase
    .from('configuracion')
    .update({ valor: false }) // o 'false' si la columna es texto
    .eq('clave', 'ventas_abierta');

  if (error) {
    alert("Error al cerrar las ventas");
    console.error(error);
  } else {
    alert("Ventas cerradas correctamente");
    location.reload(); // Opcional: recargar para que se apliquen cambios
  }
});

// Reiniciar base de datos
async function reiniciarTodo() {
  if (!confirm('¿Estás seguro de reiniciar todo?')) return;
  await supabase.from('inscripciones').delete().neq('cedula', '');
  await supabase.from('cartones').delete().neq('numero', 0);
  const { data: archivos } = await supabase.storage.from('comprobantes').list();
  const listaDiv = document.getElementById('listaAprobados');
  if (listaDiv) listaDiv.innerHTML = '';
  for (const file of archivos) {
    await supabase.storage.from('comprobantes').remove([file.name]);
  }
  alert('Datos reiniciados');
  location.reload();
}

// Variables para modal
let cartonSeleccionadoTemporal = null;
let cartonElementoTemporal = null;


// Abrir modal con imagen del cartón
function abrirModalCarton(numero, elemento) {
  cartonSeleccionadoTemporal = numero;
  cartonElementoTemporal = elemento;
  const img = document.getElementById('imagen-carton-modal');
  img.src = `${supabaseUrl}/storage/v1/object/public/cartones/SERIAL_BINGOANDINO75_CARTON_${String(numero).padStart(5, '0')}.jpg`;

  document.getElementById('modal-carton').classList.remove('oculto');

  const btn = document.getElementById('btnSeleccionarCarton');
  btn.onclick = () => {
    toggleCarton(cartonSeleccionadoTemporal, cartonElementoTemporal);
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
async function elegirMasCartones() {
  const cedula = document.getElementById('consulta-cedula').value;

  // Consultar datos del usuario por cédula
  const { data, error } = await supabase.from('inscripciones').select('*').eq('cedula', cedula);

  if (error || data.length === 0) {
    return alert('No se encontró ningún usuario con esa cédula');
  }

  const inscripcion = data[0];

  // Asignar los datos al usuario actual
  usuario.nombre = inscripcion.nombre;
  usuario.telefono = inscripcion.telefono;
  usuario.cedula = inscripcion.cedula;
  usuario.referido = inscripcion.referido;
  usuario.cartones = [];

  // Ir a pantalla de selección

  mostrarVentana('cantidad');      // 👈 aquí va a la nueva ventana
  actualizarPreseleccion();    
}
document.getElementById('abrirVentasBtn').addEventListener('click', async () => {
  const confirmacion = confirm("¿Estás seguro que quieres abrir las ventas?");
  if (!confirmacion) return;

  const { error } = await supabase
    .from('configuracion')
    .update({ valor: true })  // poner ventas_abierta = true
    .eq('clave', 'ventas_abierta');

  if (error) {
    alert("Error al abrir las ventas");
    console.error(error);
  } else {
    alert("Ventas abiertas correctamente");
    location.reload(); // Opcional: recargar para que se apliquen cambios
  }
});
// Aprobar = simplemente marcar la inscripción como "aprobado"
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
// Rechazar = borrar los cartones ocupados y marcar "rechazado"
async function rechazarInscripcion(item, fila) {
  const confirma = confirm('¿Seguro que deseas rechazar y liberar cartones?');
  if (!confirma) return;

  // 1. Liberar cartones ocupados
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

  // 2. Marcar inscripción como rechazada
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
async function rechazar(inscripcionId, cartones, comprobanteURL) {
  // 1. Liberar los cartones en Supabase
  for (let numero of cartones) {
    await supabase
      .from('cartones')
      .update({ disponible: true })
      .eq('numero', numero);
  }

  // 2. Eliminar la inscripción
  await supabase
    .from('inscripciones')
    .delete()
    .eq('id', inscripcionId);

  // 3. (Opcional) Eliminar la imagen del comprobante si quieres
  const filename = comprobanteURL.split('/').pop(); // obtén el nombre del archivo
  await supabase
    .storage
    .from('comprobantes')
    .remove([filename]);

  // 4. Recargar la lista
  cargarInscripciones(); // o la función que actualiza la tabla
}
async function rechazarInscripcion(item, tr) {
  const confirmar = confirm('¿Estás seguro de rechazar esta inscripción? Esto eliminará los datos y liberará los cartones.');
  if (!confirmar) return;

  // Eliminar inscripción de la tabla "inscripciones"
  const { error: deleteError } = await supabase
    .from('inscripciones')
    .delete()
    .eq('id', item.id);

  if (deleteError) {
    console.error(deleteError);
    alert('Error al eliminar la inscripción');
    return;
  }

  // Eliminar los cartones asignados
  for (const numero of item.cartones) {
    await supabase
      .from('cartones')
      .delete()
      .eq('numero', numero);
  }

  // Eliminar comprobante del storage si existe
  const urlSplit = item.comprobante.split('/');
  const nombreArchivo = urlSplit[urlSplit.length - 1];

  await supabase.storage.from('comprobantes').remove([nombreArchivo]);

  // Eliminar fila de la tabla visual
  tr.remove();
  alert('Inscripción rechazada y eliminada correctamente');
}
async function subirCartones() {
  const input = document.getElementById('cartonImageInput');
  const files = input.files;
  const status = document.getElementById('uploadStatus');
  status.innerHTML = '';

  if (!files.length) {
    alert('Selecciona al menos una imagen');
    return;
  }

  // Mostrar mensaje de carga
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

  // Limpiar input
  input.value = '';

  // Mostrar resultado
  if (errores.length) {
    status.innerHTML = `<p style="color:red;">Se encontraron errores:</p><ul>${errores.map(e => `<li>${e}</li>`).join('')}</ul>`;
  } else {
    status.innerHTML = '<p style="color:green;">¡Todas las imágenes fueron subidas exitosamente!</p>';
  }

  // (Opcional) Borrar el mensaje después de unos segundos
  setTimeout(() => {
    status.innerHTML = '';
  }, 5000); // 5 segundos
}
async function borrarCartones() {
  const claveCorrecta = "1234admin"; // puedes cambiarla por una más segura
  const claveIngresada = prompt("Ingrese la clave de seguridad para borrar todos los cartones:");

  if (claveIngresada !== claveCorrecta) {
    alert("Clave incorrecta. No se borraron los cartones.");
    return;
  }

  const status = document.getElementById('deleteStatus');
  status.innerHTML = 'Cargando lista de imágenes...';

  // Paso 1: Obtener la lista de imágenes
  const { data: list, error: listError } = await supabase.storage
    .from('cartones')
    .list('', { limit: 1000 });

  if (listError) {
    status.innerHTML = `<p style="color:red;">Error listando imágenes: ${listError.message}</p>`;
    return;
  }

  if (!list.length) {
    status.innerHTML = '<p style="color:orange;">No hay imágenes para borrar.</p>';
    return;
  }

  // Paso 2: Borrar
  const fileNames = list.map(file => file.name);

  const { error: deleteError } = await supabase.storage
    .from('cartones')
    .remove(fileNames);

  if (deleteError) {
    status.innerHTML = `<p style="color:red;">Error al borrar imágenes: ${deleteError.message}</p>`;
  } else {
    status.innerHTML = `<p style="color:green;">Se borraron ${fileNames.length} imágenes exitosamente.</p>`;
  }

  setTimeout(() => {
    status.innerHTML = '';
  }, 5000);
}
function mostrarSeccion(id) {
  const secciones = document.querySelectorAll('section');
  secciones.forEach(sec => sec.classList.add('oculto'));

  const target = document.getElementById(id);
  if (target) target.classList.remove('oculto');

  // Mostrar redes solo en la sección de inicio
  const redes = document.getElementById('redes-sociales');
  if (redes) {
    redes.style.display = id === 'inicio' ? 'flex' : 'none';
  }
}
async function guardarNuevoTotal() {
  const nuevoTotal = parseInt(document.getElementById("nuevoTotalCartones").value);

  if (isNaN(nuevoTotal) || nuevoTotal < 1) {
    document.getElementById("estadoTotalCartones").textContent = "Número inválido.";
    return;
  }

  const { error } = await supabase
    .from('configuracion')
    .update({ total_cartones: nuevoTotal })
    .eq('clave', 1);

  if (!error) {
    document.getElementById("estadoTotalCartones").textContent = "¡Total actualizado!";
    totalCartones = nuevoTotal;
    generarCartones(); // Regenera los cartones
  } else {
    document.getElementById("estadoTotalCartones").textContent = "Error al actualizar.";
  }
}
async function contarCartonesVendidos() {
  const { count, error } = await supabase
    .from('cartones')
    .select('numero', { count: 'exact', head: true }); // ← solo el COUNT, sin filas

  if (error) {
    console.error('Error al contar cartones:', error);
    return;
  }
  document.getElementById('total-vendidos').textContent = count || 0;
}
const obtenerMontoTotalRecaudado = async () => {
  const { data, error } = await supabase
    .from('inscripciones')
    .select('cartones');

  if (error) {
    console.error('Error al obtener inscripciones:', error.message);
    return;
  }

  let totalCartones = 0;

  data.forEach(inscripcion => {
    if (Array.isArray(inscripcion.cartones)) {
      totalCartones += inscripcion.cartones.length;
    }
  });

  // Cambia esto si tu precio es diferente
  const montoTotal = totalCartones * precioPorCarton;
document.getElementById('totalMonto').textContent = 
  new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(montoTotal);

};

// Llama la función cuando cargue el admin
obtenerMontoTotalRecaudado();
// Variable global para el precio

// Función para cargar el precio desde Supabase al iniciar el admin
async function cargarPrecioPorCarton() {
  const { data, error } = await supabase
    .from('configuracion')
    .select('valore')
    .eq('clave', 'precio_por_carton')
    .single();

  if (error) {
    console.error('Error cargando precio por cartón:', error);
  } else if (data) {
    precioPorCarton = parseFloat(data.valore);
    document.getElementById('precioCarton').value = precioPorCarton;
  }
}

// Función para guardar el precio nuevo al hacer clic en el botón
document.getElementById('guardarPrecioBtn').addEventListener('click', async () => {
  const nuevoPrecio = parseFloat(document.getElementById('precioCarton').value);
  if (isNaN(nuevoPrecio) || nuevoPrecio < 0) {
    alert('Ingrese un precio válido');
    return;
  }

  const { error } = await supabase
    .from('configuracion')
    .update({ valore: nuevoPrecio })
    .eq('clave', 'precio_por_carton');

  if (error) {
    alert('Error guardando el precio');
    console.error(error);
  } else {
    alert('Precio actualizado correctamente');
    precioPorCarton = nuevoPrecio;
    // Aquí puedes llamar a la función que actualiza el monto en pantalla
    actualizarMonto();
  }
});

// Llama esta función cuando entres al panel admin para cargar el precio
async function iniciarAdmin() {
  await cargarPrecioPorCarton();
  // Resto de código para iniciar panel admin...
}

function actualizarMonto() {
  const cantidadCartones = usuario.cartones.length || 0;
  const total = cantidadCartones * precioPorCarton;
  document.getElementById('monto-total').textContent = total.toFixed(2);
}
document.getElementById('imprimirListaBtn').addEventListener('click', () => {
  const lista = document.getElementById('listaAprobados');
  if (!lista.innerHTML.trim()) {
    alert('Primero debes generar la lista de aprobados.');
    return;
  }
  window.print();
});
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

// Generar filas por cada cartón
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

// Ordenar por número de cartón
filas.sort((a, b) => a.carton - b.carton);

// Insertar en tabla
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

actualizarHoraVenezuela(); // Primera vez
  
  setInterval(actualizarHoraVenezuela, 1000); // Luego cada segundo

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
  btn.style.display = 'inline-block'; // mostrar botón si hay link
}

// Llama esta función cuando cargue la app o la pantalla inicio
window.addEventListener('DOMContentLoaded', cargarLinkWhatsapp);
document.getElementById('modal-terminos').classList.remove('oculto');
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
async function cargarPanelAdmin() {
  await obtenerMontoTotalRecaudado();
  await contarCartonesVendidos();
  await cargarModoCartonesAdmin();
  await cargarCartones(); // ← asegúrate de que esto se llama
}
let modoCartones = "libre";
let cantidadFijaCartones = 1;

async function cargarConfiguracionModoCartones() {
  const { data: modoData, error: modoError } = await supabase
    .from('configuracion')
    .select('valore')
    .eq('clave', 'modo_cartones')
    .single();

  if (!modoError && modoData) {
    modoCartones = modoData.valore; // "fijo" o "libre"
  }

  if (modoCartones === "fijo") {
    const { data: cantData, error: cantError } = await supabase
      .from('configuracion')
      .select('valore')
      .eq('clave', 'cartones_obligatorios')
      .single();

    if (!cantError && cantData) {
      cantidadFijaCartones = parseInt(cantData.valore) || 1;
    }
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
document.getElementById('modoCartonesSelect').addEventListener('change', () => {
  const modo = document.getElementById('modoCartonesSelect').value;
  const contenedor = document.getElementById('contenedorCartonesFijos');
  contenedor.style.display = (modo === 'fijo') ? 'block' : 'none';
});
document.getElementById('guardarModoCartonesBtn').addEventListener('click', async () => {
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
  }
});
async function guardarGanador() {
  const nombre   = document.getElementById('ganadorNombre').value.trim();
  const cedula   = document.getElementById('ganadorCedula').value.trim();
  const cartones = document.getElementById('ganadorCartones').value.trim();
  const premio   = document.getElementById('ganadorPremio').value.trim();
  const telefono  = document.getElementById('ganadorTelefono').value.trim();
  const fecha    = document.getElementById('ganadorFecha').value.trim(); // ahora manual

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

async function mostrarSeccion(id) {
  document.querySelectorAll('section').forEach(s => s.classList.add('oculto'));
  document.getElementById(id).classList.remove('oculto');

  if (id === 'ganadores') {
    await cargarGanadores();
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
document.querySelectorAll('#formularioGanador input').forEach((input, index, all) => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // evitar que intente enviar el form
      if (index < all.length - 1) {
        all[index + 1].focus(); // enfoca el siguiente input
      }
    }
  });
});
document.getElementById('clave-admin').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault(); // evita el comportamiento por defecto
    entrarAdmin(); // llama a la función de acceso
  }
});
function toggleFormularioGanador() {
  const contenedor = document.getElementById('formularioGanadorContenedor');
  contenedor.style.display = contenedor.style.display === 'none' ? 'block' : 'none';
}
supabase
  .channel('configuracion-changes')       // 1. Crea un canal de escucha llamado "configuracion-changes"
  .on(
    'postgres_changes',                   // 2. Escucha cambios en la base de datos de tipo "postgres_changes"
    {
      event: 'UPDATE',                   // 3. Solo escucha eventos de tipo "UPDATE"
      schema: 'public',                  // 4. En el esquema público
      table: 'configuracion',            // 5. En la tabla "configuracion"
      filter: 'clave=in.(modo_cartones,cartones_obligatorios)' // 6. Pero solo si se actualiza el campo "modo_cartones" o "cartones_obligatorios"
    },
    async (payload) => {                 // 7. Esto es lo que ocurre cuando se detecta el cambio:
      const clave = payload.new.clave;
      const valor = payload.new.valore;

      if (clave === 'modo_cartones') {
        modoCartones = valor; // actualiza la variable global
        document.getElementById('modoCartonesSelect').value = valor; // actualiza el select en el admin
      }

      if (clave === 'cartones_obligatorios') {
        cantidadFijaCartones = parseInt(valor); // actualiza la variable global
        document.getElementById('cantidadCartonesFijos').value = valor; // actualiza el input en el admin
      }
    }
  )
  .subscribe(); // 8. Activa la suscripción
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
async function eliminarInscripcion(item, fila) {
  const confirmar = confirm('¿Eliminar esta inscripción y liberar cartones?');

  if (!confirmar) return;

  try {
    // 1. Eliminar cartones
    if (item.cartones?.length) {
      await supabase.from('cartones').delete().in('numero', item.cartones);
    }

    // 2. Eliminar comprobante del bucket
    if (item.comprobante) {
      const partes = item.comprobante.split('/');
      const nombreArchivo = partes.pop();
      await supabase.storage.from('comprobantes').remove([nombreArchivo]);
    }

    // 3. Eliminar inscripción
    await supabase.from('inscripciones').delete().eq('id', item.id);

    // 4. Remover visualmente del panel admin
    fila.remove();

    // 5. Quitar de lista de aprobados (admin)
    const listaAdmin = document.getElementById('listaAprobados');
    if (listaAdmin) {
      listaAdmin.querySelectorAll('tr').forEach(tr => {
        const celdas = tr.querySelectorAll('td');
        if (celdas.length && celdas[1].textContent === item.cedula) {
          tr.remove();
        }
      });
    }

    // 6. Quitar de la vista pública
    const listaPublica = document.getElementById('contenedor-aprobados');
    if (listaPublica) {
      listaPublica.querySelectorAll('tr').forEach(tr => {
        const celdas = tr.querySelectorAll('td');
        if (celdas.length && celdas[1].textContent === item.cedula) {
          tr.remove();
        }
      });
    }

    alert('Inscripción eliminada correctamente.');
  } catch (err) {
    console.error(err);
    alert('Error al eliminar inscripción.');
  }
}
function ordenarInscripcionesPorNombre() {
  const tabla = document.querySelector('#tabla-comprobantes tbody');
  const filas = Array.from(tabla.rows);

  // Ordena por nombre (columna 0)
  filas.sort((a, b) => {
    const nombreA = a.cells[0].textContent.trim().toLowerCase();
    const nombreB = b.cells[0].textContent.trim().toLowerCase();
    return nombreA.localeCompare(nombreB);
  });

  // Limpia la tabla y vuelve a insertar las filas ordenadas
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
    // Tomamos el valor de la columna de referencia (ajusta el índice según el orden real de tus columnas)
    const refA = a.cells[5].textContent.trim(); // Cambia el número si tu columna no es la 6ta
    const refB = b.cells[5].textContent.trim();
    // Convierte a número para comparar
    const numA = parseInt(refA) || 0;
    const numB = parseInt(refB) || 0;

    return ordenReferenciaAscendente ? numA - numB : numB - numA;
  });

  tabla.innerHTML = '';
  filas.forEach(fila => tabla.appendChild(fila));

  ordenReferenciaAscendente = !ordenReferenciaAscendente; // Alterna orden para cada clic
}
// Link universal a WhatsApp con heurística para Venezuela
function buildWhatsAppLink(rawPhone, presetMsg = '') {
  if (!rawPhone) return null;

  // 1) Normaliza: quita espacios, guiones, puntos, paréntesis
  let s = String(rawPhone).trim().replace(/[\s\-\.\(\)]/g, '');

  // 2) Convierte "00" internacional a "+"
  if (s.startsWith('00')) s = '+' + s.slice(2);

  // 3) Si NO trae + (formato local), intenta detectar Venezuela móvil
  if (!s.startsWith('+')) {
    // Solo dígitos para validar prefijos
    const digits = s.replace(/\D+/g, '');
    // Prefijos VE móviles: 412, 414, 416, 424, 426 (con o sin 0 inicial)
    const m = /^(0?)(412|414|416|424|426)(\d{7})$/.exec(digits);
    if (m) {
      // Fuerza internacional: +58 + prefijo + 7 dígitos
      s = '+58' + m[2] + m[3];
    } else {
      // (Opcional) Si quieres un país por defecto cuando no sea VE:
      // s = '+58' + digits; // cambia 58 por tu país base o comenta para dejarlo tal cual
      s = '+' + digits; // intenta internacional genérico
    }
  }

  // 4) wa.me no acepta el "+" en el path
  const waNumber = s.replace(/^\+/, '');

  const text = encodeURIComponent(presetMsg || 'Hola, te escribo de parte del equipo de bingoandino75.');
  return `https://wa.me/${waNumber}?text=${text}`;
}
async function fetchTodosLosOcupados() {
  const pageSize = 1000;
  let from = 0;
  let todos = [];

  // Primero pide el count total (sin traer filas)
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

  // Fuerza a número para que funcione includes()
  return todos.map(r => Number(r.numero));
}
