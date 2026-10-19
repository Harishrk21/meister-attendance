/*!
 * Meister Attendance embed SDK — drop attendance into any dashboard.
 *
 *   <div id="attendance"></div>
 *   <script src="https://attendance.example.com/embed.js"></script>
 *   <script>
 *     MeisterAttendance.mount('#attendance', {
 *       src: ssoUrlFromYourBackend,   // e.g. https://attendance.example.com/sso?ticket=…&redirect=/clock
 *       view: 'app',                  // 'app' (full module) or 'clock' (compact clock-in card)
 *       onEvent: function (e) { console.log(e.type, e) }
 *     })
 *   </script>
 */
;(function (window) {
  'use strict'

  var SOURCE = 'meister-attendance'
  var VIEWS = { app: '/', clock: '/widget/clock' }
  var scriptOrigin = (function () {
    var current = document.currentScript
    try {
      return current && current.src ? new URL(current.src).origin : window.location.origin
    } catch (e) {
      return window.location.origin
    }
  })()

  function buildSrc(opts) {
    var url = new URL(opts.src || VIEWS[opts.view || 'app'] || '/', opts.baseUrl || scriptOrigin)
    if (opts.src && opts.view === 'clock' && url.pathname === '/sso' && !url.searchParams.get('redirect')) {
      url.searchParams.set('redirect', VIEWS.clock)
    }
    url.searchParams.set('embed', '1')
    return url
  }

  function mount(target, opts) {
    opts = opts || {}
    var el = typeof target === 'string' ? document.querySelector(target) : target
    if (!el) throw new Error('MeisterAttendance: mount target not found')

    var url = buildSrc(opts)
    var expectedOrigin = url.origin
    var compact = opts.view === 'clock'

    var iframe = document.createElement('iframe')
    iframe.src = url.toString()
    iframe.title = opts.title || 'Attendance'
    iframe.allow = 'geolocation'
    iframe.referrerPolicy = 'origin'
    iframe.style.border = '0'
    iframe.style.width = '100%'
    iframe.style.display = 'block'
    iframe.style.colorScheme = 'normal'
    iframe.style.height = opts.height || (compact ? '420px' : '100%')
    if (!compact && !opts.height) iframe.style.minHeight = '640px'

    function onMessage(event) {
      if (event.source !== iframe.contentWindow || event.origin !== expectedOrigin) return
      var data = event.data
      if (!data || data.source !== SOURCE) return
      if (data.type === 'resize' && compact && !opts.height && typeof data.height === 'number') {
        iframe.style.height = data.height + 'px'
      }
      if (typeof opts.onEvent === 'function') opts.onEvent(data)
    }

    window.addEventListener('message', onMessage)
    el.innerHTML = ''
    el.appendChild(iframe)

    return {
      iframe: iframe,
      destroy: function () {
        window.removeEventListener('message', onMessage)
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
      },
    }
  }

  var sdk = { mount: mount, version: '1.1.0' }
  window.MeisterAttendance = sdk
  window.HMSAttendance = window.HMSAttendance || sdk // name used by early integrations
})(window)
