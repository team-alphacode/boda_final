// ====== SCRIPT PARA INVITACION.HTML (SCROLL Y CONTADOR) ======
document.addEventListener("DOMContentLoaded", () => {
    
    // LÓGICA DEL CONTADOR
    const fechaBoda = new Date('2026-12-19T17:00:00-06:00').getTime();
    
    const elementoDias = document.getElementById('dias');
    const elementoHoras = document.getElementById('horas');
    const elementoMinutos = document.getElementById('minutos');
    const elementoSegundos = document.getElementById('segundos');
    
    if (elementoDias && elementoHoras && elementoMinutos && elementoSegundos) {
        const temporizador = setInterval(() => {
            const ahora = new Date().getTime();
            const diferencia = fechaBoda - ahora;
            
            const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));
            const horas = Math.floor((diferencia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));
            const segundos = Math.floor((diferencia % (1000 * 60)) / 1000);
            
            elementoDias.innerText = String(dias).padStart(2, '0');
            elementoHoras.innerText = String(horas).padStart(2, '0');
            elementoMinutos.innerText = String(minutos).padStart(2, '0');
            elementoSegundos.innerText = String(segundos).padStart(2, '0');
            
            if (diferencia < 0) {
                clearInterval(temporizador);
                elementoDias.innerText = "00"; 
                elementoHoras.innerText = "00"; 
                elementoMinutos.innerText = "00"; 
                elementoSegundos.innerText = "00";
            }
        }, 1000);
    }

    // Importar lógica de Firebase
    import('./js/invitation.js?v=10').catch(() => {
        const status = document.getElementById('invitation-status');
        if (status) status.textContent = 'No pudimos conectar con la invitación. Revisa tu conexión y vuelve a cargar la página.';
    });
    

    // === V2: mejorar foco, teclado móvil y uso horizontal del RSVP ===
    // Sin modificar las transacciones ni las funciones de Firebase.
    const overlaysRsvp = Array.from(document.querySelectorAll('.rsvp-overlay'));
    const viewportRsvp = window.visualViewport;
    let mayorAltoVisible = Math.max(window.innerHeight, viewportRsvp?.height || 0);

    function modalActivo() {
        // La invitación existente ya abre/cierra los modales mediante hidden.
        return overlaysRsvp.findLast
            ? overlaysRsvp.findLast(el => !el.hidden)
            : overlaysRsvp.slice().reverse().find(el => !el.hidden);
    }

    function actualizarTecladoRsvp() {
        const actual = viewportRsvp?.height || window.innerHeight;
        const elemento = document.activeElement;
        const escribiendo = elemento instanceof HTMLInputElement &&
            !elemento.disabled && !elemento.readOnly &&
            ['text', 'email', 'search', 'tel', 'number'].includes(elemento.type);
        const abierto = escribiendo && mayorAltoVisible - actual > 115;
        overlaysRsvp.forEach(el => {
            el.classList.toggle('rsvp-keyboard-visible', Boolean(abierto && !el.hidden));
        });
        if (!escribiendo && actual > mayorAltoVisible) mayorAltoVisible = actual;
    }

    const enfocabless = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    function controlesEnModal(modal) {
        return Array.from(modal.querySelectorAll(enfocabless))
            .filter(el => !el.closest('[hidden]') && el.getClientRects().length > 0);
    }

    // Evita que Tab/Shift+Tab salgan del modal a campos del fondo.
    document.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const modal = modalActivo();
        if (!modal) return;
        const controles = controlesEnModal(modal);
        if (!controles.length) return;
        const primero = controles[0], ultimo = controles[controles.length - 1];
        const dentro = modal.contains(document.activeElement);
        if (!dentro || (event.shiftKey && document.activeElement === primero)) {
            event.preventDefault();
            (event.shiftKey && dentro ? ultimo : primero).focus();
        } else if (!event.shiftKey && document.activeElement === ultimo) {
            event.preventDefault();
            primero.focus();
        }
    });

    // Al enfocar campos del RSVP, dejarlos visibles con el teclado virtual.
    document.addEventListener('focusin', event => {
        const campo = event.target;
        if (!(campo instanceof HTMLInputElement) || campo.disabled || campo.readOnly) return;
        if (!campo.closest('.rsvp-overlay, #rsvp-section')) return;
        window.setTimeout(() => {
            if (document.activeElement !== campo) return;
            actualizarTecladoRsvp();
            // block:nearest evita saltos grandes en la invitación.
            campo.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
        }, 220);
    });
    document.addEventListener('focusout', () => window.setTimeout(actualizarTecladoRsvp, 100));

    if (viewportRsvp) viewportRsvp.addEventListener('resize', actualizarTecladoRsvp);
    window.addEventListener('resize', actualizarTecladoRsvp);
    window.addEventListener('orientationchange', () => {
        // El teclado no debe confundirse con el giro del teléfono.
        window.setTimeout(() => {
            mayorAltoVisible = Math.max(window.innerHeight, viewportRsvp?.height || 0);
            actualizarTecladoRsvp();
        }, 350);
    });

    // BOTÓN: VOLVER AL INICIO
    const btnVolverInicio = document.getElementById('volver-al-inicio');
    const inicioInvitacion = document.getElementById('inicio-invitacion');

    if (btnVolverInicio && inicioInvitacion) {
        btnVolverInicio.addEventListener('click', () => {
            inicioInvitacion.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        });
    }
});



// ===== V6: reproductor musical y consulta al continuar la invitación =====
// La pista solo arranca por un toque del usuario. No añade consultas a Firebase.
document.addEventListener('DOMContentLoaded', () => {
    const boton = document.getElementById('musicToggleBtn');
    const audio = document.getElementById('weddingAudio');
    const seccion = document.getElementById('nuestra-pista');
    const estado = document.getElementById('musicStatus');
    const aviso = document.getElementById('music-choice-overlay');
    const seguir = document.getElementById('music-continue-audio');
    const sinMusica = document.getElementById('music-stop-audio');
    const error = document.getElementById('music-choice-error');
    if (!boton || !audio || !seccion || !aviso || !seguir || !sinMusica) return;

    let avisoAbierto = false;
    let eleccionResuelta = false;
    let reproduccionIniciadaEnSeccion = false;
    let ultimoScrollY = window.scrollY;
    let scrollBloqueadoY = 0;
    let focoAnterior = null;
    let verificandoSalida = false;
    const opciones = [seguir, sinMusica];

    function estaVisible() {
        const r = seccion.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0;
    }

    function actualizarBoton() {
        const reproduciendo = !audio.paused && !audio.ended;
        boton.classList.toggle('is-playing', reproduciendo);
        boton.setAttribute('aria-pressed', String(reproduciendo));
        boton.setAttribute('aria-label', reproduciendo ? 'Pausar nuestra pista de boda' : 'Reproducir nuestra pista de boda');
        boton.title = reproduciendo ? 'Pausar nuestra pista' : 'Reproducir nuestra pista';
        if (estado) estado.textContent = reproduciendo ? 'Reproduciendo nuestra pista' : 'Pista pausada';
    }

    function bloquearPagina() {
        scrollBloqueadoY = window.scrollY;
        document.body.style.top = `-${scrollBloqueadoY}px`;
        document.body.classList.add('music-choice-open');
    }

    function desbloquearPagina() {
        document.body.classList.remove('music-choice-open');
        document.body.style.top = '';
        window.scrollTo(0, scrollBloqueadoY);
        ultimoScrollY = scrollBloqueadoY;
    }

    function abrirAviso() {
        if (avisoAbierto || eleccionResuelta || audio.paused || !reproduccionIniciadaEnSeccion) return;
        avisoAbierto = true;
        audio.pause();  // La música no sigue sonando mientras decide.
        if (error) { error.textContent = ''; error.hidden = true; }
        focoAnterior = document.activeElement;
        aviso.hidden = false;
        bloquearPagina();
        seguir.focus({ preventScroll: true });
    }

    function cerrarAviso() {
        aviso.hidden = true;
        avisoAbierto = false;
        desbloquearPagina();
        // No enfocamos el botón Play si ya quedó fuera de pantalla:
        // eso haría que el navegador saltara de vuelta a la sección musical.
        if (focoAnterior && focoAnterior.isConnected && focoAnterior !== boton && focoAnterior !== document.body) {
            focoAnterior.focus({ preventScroll: true });
        } else {
            // Para navegación con teclado, continuar en la sección siguiente
            // sin mover el scroll hacia el botón musical fuera de pantalla.
            const siguiente = seccion.nextElementSibling;
            if (siguiente && typeof siguiente.focus === 'function') {
                if (!siguiente.hasAttribute('tabindex')) siguiente.setAttribute('tabindex', '-1');
                siguiente.focus({ preventScroll: true });
            }
        }
        focoAnterior = null;
    }

    function comprobarSalida() {
        verificandoSalida = false;
        const y = window.scrollY;
        const bajando = y > ultimoScrollY + 1;
        ultimoScrollY = y;
        if (avisoAbierto || eleccionResuelta || audio.paused || !reproduccionIniciadaEnSeccion) return;
        const rect = seccion.getBoundingClientRect();
        // Solo al bajar por debajo de la sección completa, nunca al subir.
        if (bajando && rect.bottom <= 0) abrirAviso();
    }

    window.addEventListener('scroll', () => {
        if (!verificandoSalida) {
            verificandoSalida = true;
            window.requestAnimationFrame(comprobarSalida);
        }
    }, { passive: true });

    boton.addEventListener('click', () => {
        if (audio.paused || audio.ended) {
            if (audio.ended) audio.currentTime = 0;
            // Volver a tocar Play dentro de la lámina comienza una sesión nueva.
            if (estaVisible()) {
                eleccionResuelta = false;
                reproduccionIniciadaEnSeccion = true;
                ultimoScrollY = window.scrollY;
            }
            // Llamada inmediata en el gesto del usuario (requerida por Safari).
            const intento = audio.play();
            if (intento && typeof intento.catch === 'function') {
                intento.catch(e => {
                    console.warn('No se pudo iniciar la pista:', e);
                    if (estado) estado.textContent = 'No se pudo reproducir la pista. Intenta de nuevo.';
                    actualizarBoton();
                });
            }
        } else {
            audio.pause();
        }
    });

    seguir.addEventListener('click', () => {
        if (!avisoAbierto) return;
        seguir.disabled = true;
        // play() ocurre antes de cualquier espera asíncrona: compatible con iPhone.
        let intento;
        try { intento = audio.play(); }
        catch (e) { intento = Promise.reject(e); }
        Promise.resolve(intento).then(() => {
            eleccionResuelta = true;
            cerrarAviso();
        }).catch(() => {
            if (error) {
                error.textContent = 'No se pudo continuar el audio. Prueba de nuevo o sigue sin música.';
                error.hidden = false;
            }
        }).finally(() => { seguir.disabled = false; });
    });

    function continuarSinMusica() {
        if (!avisoAbierto) return;
        audio.pause();
        eleccionResuelta = true;
        cerrarAviso();
    }

    sinMusica.addEventListener('click', continuarSinMusica);

    aviso.addEventListener('keydown', evento => {
        if (!avisoAbierto) return;
        if (evento.key === 'Escape') {
            evento.preventDefault();
            continuarSinMusica();
            return;
        }
        if (evento.key === 'Tab') {
            const primero = opciones[0];
            const ultimo = opciones[1];
            const actual = document.activeElement;
            if (evento.shiftKey && (actual === primero || !aviso.contains(actual))) {
                evento.preventDefault(); ultimo.focus();
            } else if (!evento.shiftKey && (actual === ultimo || !aviso.contains(actual))) {
                evento.preventDefault(); primero.focus();
            }
        }
    });

    ['play', 'playing', 'pause', 'ended'].forEach(e => audio.addEventListener(e, actualizarBoton));
    audio.addEventListener('ended', () => { reproduccionIniciadaEnSeccion = false; });
    audio.addEventListener('error', () => {
        actualizarBoton();
        if (estado) estado.textContent = 'No se pudo cargar la pista. Verifica la conexión.';
    });
    actualizarBoton();
});
