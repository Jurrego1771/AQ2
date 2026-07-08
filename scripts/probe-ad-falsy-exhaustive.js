// Probe exhaustivo de falsys en update.js para ads VAST.
// Crea un ad con todos los campos poblados, intenta clear con '' en cada uno.
const { request } = require('@playwright/test');

const truthy = (v) => v != null && v !== '';
const isObj = (v) => typeof v === 'object' && v !== null && Object.keys(v).length > 0;

(async () => {
  const ctx = await request.newContext({ baseURL: 'https://dev.platform.mediastre.am', storageState: '.auth/user.json' });
  const NAME = '[QA-AUTO] Ad Falsy Exhaustive ' + Date.now();

  // Create with all fields set
  const c = await ctx.post('/api/ad/new', { data: {
    name: NAME, type: 'vast', is_enabled: 'false',
    schedule: {
      pre: { tag: 'https://example.com/pre.xml', tag_mobile: 'https://example.com/pre-m.xml' },
      post: { tag: 'https://example.com/post.xml', tag_mobile: 'https://example.com/post-m.xml' },
      mid: [ { tag: 'https://example.com/mid1.xml', position: '5' } ],
      overlay: { tag: 'https://example.com/overlay.xml', position: '5' },
      pausead: {
        tag: 'https://example.com/pausead.xml', duration: '10',
        tag_mobile: 'https://example.com/pausead-m.xml', duration_mobile: '20',
        position: 'top-left', close_button: 10,
        messages: { close_text: 'Cerrar Anuncio', view_more_text: 'Ver Mas Detalles' }
      }
    }
  } });
  if (c.status() !== 200) { console.error('CREATE fail', c.status(), await c.text()); process.exit(1); }
  const id = (await c.json()).data._id;
  console.log('id =', id);

  // Update with EMPTY strings (or false for booleans, 0 for numbers)
  const upd = await ctx.post('/api/ad/' + id, { data: {
    name: NAME + ' EDIT', type: 'vast', is_enabled: 'false',
    schedule: {
      pre: { tag: '', tag_mobile: '' },
      post: { tag: '', tag_mobile: '' },
      mid: [],  // empty array
      overlay: { tag: '', position: '' },
      pausead: {
        tag: '', duration: '',
        tag_mobile: '', duration_mobile: '',
        position: '', close_button: 0,  // 0 == "Don't allow" for close_button
        messages: { close_text: '', view_more_text: '' }
      }
    }
  } });
  console.log('UPDATE status:', upd.status());

  const after = (await (await ctx.get('/api/ad/' + id)).json()).data;
  const s = after.schedule || {};
  const pa = s.pausead || {};
  const msg = pa.messages || {};

  const cases = [
    ['schedule.pre.tag',                 s.pre?.tag],
    ['schedule.pre.tag_mobile',          s.pre?.tag_mobile],
    ['schedule.post.tag',                s.post?.tag],
    ['schedule.post.tag_mobile',         s.post?.tag_mobile],
    ['schedule.mid (expected [])',       JSON.stringify(s.mid)],
    ['schedule.overlay.tag',             s.overlay?.tag],
    ['schedule.overlay.position',        s.overlay?.position],
    ['schedule.pausead.tag',             pa.tag],
    ['schedule.pausead.duration',        pa.duration],
    ['schedule.pausead.tag_mobile',      pa.tag_mobile],
    ['schedule.pausead.duration_mobile', pa.duration_mobile],
    ['schedule.pausead.position',        pa.position],
    ['schedule.pausead.close_button',    pa.close_button],
    ['schedule.pausead.messages.close_text',     msg.close_text],
    ['schedule.pausead.messages.view_more_text',  msg.view_more_text],
  ];

  console.log('\nDESPUES de update con empty strings:');
  const leaks = [];
  for (const [label, val] of cases) {
    const isLeak = val != null && val !== '' && val !== '[]' && val !== '0';
    console.log((isLeak ? '  LEAK: ' : '  ok:    ') + label + ' = ' + JSON.stringify(val));
    if (isLeak) leaks.push(label);
  }

  console.log('\nFALSY LEAKS (' + leaks.length + '):', leaks.join(' | '));

  // Cleanup
  await ctx.delete('/api/ad/' + id);
  await ctx.dispose();
})();
