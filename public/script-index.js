// ==============================================================
// INTRO DE BODA - INDEX.HTML
// Carga -> Sobre -> Video -> invitacion.html
// ==============================================================

document.addEventListener("DOMContentLoaded", () => {
    const pantallaCarga = document.getElementById("pantalla-carga");
    const pantallaSobre = document.getElementById("pantalla-sobre");
    const pantallaVideo = document.getElementById("pantalla-video");
    const textoCarga = document.getElementById("texto-carga");
    const sello = document.getElementById("sello-interactivo");
    const video = document.getElementById("video-invitacion");
    const bufferVideo = document.getElementById("buffer-video");
    const fallbackVideo = document.getElementById("fallback-video");
    const saltarVideo = document.getElementById("saltar-video");

    if (!pantallaCarga || !pantallaSobre || !pantallaVideo || !textoCarga || !sello || !video) {
        console.error("Faltan elementos necesarios para iniciar la invitación.");
        return;
    }

    let abriendo = false;
    let videoConError = false;
    let watchdog = null;
    let finished = false;
    // V16: el texto explica el botón al comenzar, luego queda el icono.
    let relojBotonSaltar = null;
    const mostrarBotonSaltar = () => {
        if (!saltarVideo) return;
        saltarVideo.classList.remove('compacto');
        saltarVideo.hidden = false;
        clearTimeout(relojBotonSaltar);
        relojBotonSaltar = setTimeout(() => {
            if (!finished && !saltarVideo.hidden) {
                saltarVideo.classList.add('compacto');
            }
        }, 3200);
    };

    // Mantiene el token de la invitación al pasar de la intro a invitacion.html.
    const fallbackLink = fallbackVideo?.querySelector('a');
    if (fallbackLink) {
        fallbackLink.href = 'invitacion.html' + window.location.search + window.location.hash;
    }

    const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const destinoInvitacion = () => "invitacion.html" + window.location.search + window.location.hash;
    function continuarSinVideo() {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        clearTimeout(relojBotonSaltar);
        try { video.pause(); } catch (_) {}
        window.location.assign(destinoInvitacion());
    }
    saltarVideo?.addEventListener("click", continuarSinVideo);
    function vigilarReproduccion() {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
            // No bloquear al invitado indefinidamente si el video no avanza.
            if (!finished && !pantallaVideo.classList.contains("activa")) return;
            if (!finished && video.readyState < 3) saltarVideo.hidden = false;
        }, 8000);
    }


    function activarPantalla(pantalla) {
        // V11: antes de ocultar una pantalla, retiramos el foco de sus botones.
        // Chrome avisa si se aplica aria-hidden a un ancestro del foco activo.
        const focoActual = document.activeElement;
        if (focoActual instanceof HTMLElement &&
            focoActual !== document.body &&
            !pantalla.contains(focoActual) &&
            [pantallaCarga, pantallaSobre, pantallaVideo].some(item => item.contains(focoActual))) {
            focoActual.blur();
        }

        [pantallaCarga, pantallaSobre, pantallaVideo].forEach(item => {
            const activa = item === pantalla;
            // inert impide navegar con Tab hacia controles fuera de la escena actual.
            item.inert = !activa;
            item.classList.toggle("activa", activa);
            item.setAttribute("aria-hidden", activa ? "false" : "true");
        });
    }

    async function cambiarTexto(mensaje) {
        textoCarga.classList.add("texto-oculto");
        await esperar(380);
        textoCarga.innerHTML = mensaje;
        textoCarga.classList.remove("texto-oculto");
        await esperar(120);
    }

    // ----------------------------------------------------------
    // PRECARGA REALISTA DEL VIDEO
    // No dependemos únicamente de canplaythrough, que en móviles
    // puede no dispararse aunque el video ya pueda comenzar.
    // ----------------------------------------------------------
    const videoPreparado = new Promise(resolve => {
        let resuelto = false;

        const terminar = (ok) => {
            if (resuelto) return;
            resuelto = true;
            resolve(ok);
        };

        if (video.readyState >= 2) {
            terminar(true);
            return;
        }

        video.addEventListener("loadeddata", () => terminar(true), { once: true });
        video.addEventListener("canplay", () => terminar(true), { once: true });
        video.addEventListener("error", () => {
            videoConError = true;
            terminar(false);
        }, { once: true });

        // Nunca dejamos atrapado al invitado esperando para siempre.
        setTimeout(() => terminar(video.readyState >= 2), 9000);

        try {
            video.load();
        } catch (error) {
            console.warn("No fue posible iniciar la precarga del video:", error);
        }
    });

    // ----------------------------------------------------------
    // MENSAJES DE BIENVENIDA
    // Esta secuencia da tiempo al navegador para cargar el MP4.
    // ----------------------------------------------------------
    async function ejecutarBienvenida() {
        const mensajes = [
            {
                texto: "Preparando nuestra invitación...",
                duracion: 1400
            },
            {
                texto: "Cuidando cada detalle con mucho cariño...",
                duracion: 1500
            },
            {
                texto: "Hay momentos que se vuelven inolvidables cuando se comparten.",
                duracion: 1850
            },
            {
                texto: "Nos haría mucha ilusión compartir este día contigo.",
                duracion: 1700
            }
        ];

        for (let i = 0; i < mensajes.length; i++) {
            if (i > 0) {
                await cambiarTexto(mensajes[i].texto);
            }
            await esperar(mensajes[i].duracion);
        }

        // Esperamos el video, pero el propio promise tiene un límite de 9 s.
        const listo = await videoPreparado;

        await cambiarTexto(
            listo
                ? "Nuestra invitación está lista para ti."
                : "Todo está listo para continuar."
        );
        await esperar(900);

        activarPantalla(pantallaSobre);
    }

    ejecutarBienvenida().catch(error => {
        console.error("Error durante la bienvenida:", error);
        activarPantalla(pantallaSobre);
    });

    // ----------------------------------------------------------
    // ESTADOS DE BUFFER DURANTE LA REPRODUCCIÓN
    // ----------------------------------------------------------
    const mostrarBuffer = () => bufferVideo?.classList.add("visible");
    const ocultarBuffer = () => bufferVideo?.classList.remove("visible");

    video.addEventListener("waiting", () => { mostrarBuffer(); vigilarReproduccion(); });
    video.addEventListener("stalled", () => { mostrarBuffer(); vigilarReproduccion(); });
    video.addEventListener("playing", () => { ocultarBuffer(); clearTimeout(watchdog); });
    video.addEventListener("canplay", ocultarBuffer);

    video.addEventListener("ended", continuarSinVideo);

    video.addEventListener("error", () => {
        videoConError = true;
        ocultarBuffer();
        if (abriendo) fallbackVideo.hidden = false;
    });

    // ----------------------------------------------------------
    // ABRIR EL SOBRE
    // El video se inicia muy cerca del gesto del usuario para evitar
    // bloqueos de reproducción en navegadores móviles.
    // ----------------------------------------------------------
    sello.addEventListener("click", async () => {
        if (abriendo) return;
        abriendo = true;
        sello.disabled = true;
        sello.classList.add("girar-animacion");
        pantallaSobre.classList.add("abriendo");

        if (videoConError) {
            fallbackVideo.hidden = false;
            return;
        }

        try {
            video.currentTime = 0;
            activarPantalla(pantallaVideo);
            mostrarBuffer();
            // play() se invoca SIN await previo, directamente en el click.
            // iOS Safari no pierde así la autorización del toque.
            const inicio = video.play();
            mostrarBotonSaltar();
            vigilarReproduccion();
            // Conservamos la animación inicial sin demorar la llamada play().
            await Promise.all([inicio, esperar(650)]);
            pantallaSobre.classList.remove("abriendo");
        } catch (error) {
            console.warn("El navegador no pudo reproducir el video:", error);
            clearTimeout(watchdog);
            ocultarBuffer();
            fallbackVideo.hidden = false;
        }

    });
});
