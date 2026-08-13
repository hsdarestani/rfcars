const SEED = [
  ['audi-a3-btw','Audi A3 BTW','Audi','A3',2018,11500,168000,'BENZINE',85,'','Manueel','','',null,'',[],[],'available',1],
  ['volkswagen-golf-7','Volkswagen Golf 7','Volkswagen','Golf 7',2013,8900,64000,'DIESEL',77,'1.6L','Manueel','Euro 5','Zwart',5,'Zeer goed onderhouden Volkswagen Golf 7 uit 2013 met slechts 64.000 km.',[],[],'available',0],
  ['volvo-v40','Volvo V40','Volvo','V40',2014,8900,99000,'DIESEL',84,'','Manueel','','',null,'',[],[],'available',0],
  ['opel-combo-7-plaats','Opel Combo 7 plaats','Opel','Combo',2015,5500,160000,'DIESEL',70,'','Manueel','','',7,'',[],[],'available',0],
  ['mitsubishi-outlander-hybrid','Mitsubishi Outlander Hybrid','Mitsubishi','Outlander Hybrid',2015,11500,140000,'BENZINE',89,'','Automaat','','',null,'',[],[],'available',0],
  ['mercedes-clk-200','Mercedes-Benz CLK 200','Mercedes-Benz','CLK 200',2003,4400,122000,'BENZINE',120,'','Automaat','','',null,'',[],[],'available',0],
  ['jaguar-f-pace','Jaguar F-Pace','Jaguar','F-Pace',2017,16900,155000,'DIESEL',132,'2.0L','Automaat','Euro 6b','Zwart',5,'Luxueuze en sportieve Jaguar F-Pace uit 2017.',[],[],'available',0],
  ['mitsubishi-outlander','Mitsubishi Outlander','Mitsubishi','Outlander',2011,6500,184000,'DIESEL',115,'','Automaat','','',null,'',[],[],'available',0]
];

const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const txt = (v,max=8000) => String(v ?? '').trim().slice(0,max);
const num = v => (v === '' || v === null || v === undefined || Number.isNaN(Number(v))) ? null : Math.trunc(Number(v));
const list = v => Array.isArray(v) ? v.map(x=>txt(x,1000)).filter(Boolean).slice(0,80) : [];
const slugify = v => txt(v,180).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'wagen';
const auth = (request,env) => Boolean(env.ADMIN_PASSWORD) && (request.headers.get('x-admin-password') || '') === env.ADMIN_PASSWORD;
const deny = (request,env) => !env.ADMIN_PASSWORD ? json({error:'ADMIN_NOT_CONFIGURED',message:'Stel ADMIN_PASSWORD in bij Cloudflare Pages.'},503) : (!auth(request,env) ? json({error:'UNAUTHORIZED'},401) : null);

function carInput(input={}){
  return {
    title:txt(input.title,180),make:txt(input.make,80),model:txt(input.model,100),year:num(input.year),price:num(input.price),mileage:num(input.mileage),
    fuel:txt(input.fuel,40),power_kw:num(input.power_kw),engine:txt(input.engine,60),transmission:txt(input.transmission,40),euro_class:txt(input.euro_class,60),
    color:txt(input.color,60),seats:num(input.seats),description:txt(input.description,8000),options:list(input.options),images:list(input.images).slice(0,24),
    status:input.status === 'sold' ? 'sold' : 'available',featured:input.featured ? 1 : 0
  };
}
function row(r){if(!r)return null;let options=[],images=[];try{options=JSON.parse(r.options_json||'[]')}catch{}try{images=JSON.parse(r.images_json||'[]')}catch{}return {...r,options,images,featured:Boolean(r.featured)}}

async function db(env){
  if(!env.DB) throw new Error('DB_NOT_CONFIGURED');
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS cars (id INTEGER PRIMARY KEY AUTOINCREMENT,slug TEXT NOT NULL UNIQUE,title TEXT NOT NULL,make TEXT,model TEXT,year INTEGER,price INTEGER,mileage INTEGER,fuel TEXT,power_kw INTEGER,engine TEXT,transmission TEXT,euro_class TEXT,color TEXT,seats INTEGER,description TEXT,options_json TEXT NOT NULL DEFAULT '[]',images_json TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'available',featured INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE INDEX IF NOT EXISTS idx_cars_status ON cars(status);`);
  const seeded = await env.DB.prepare("SELECT value FROM settings WHERE key='seeded_v1'").first();
  if(!seeded){
    const q = `INSERT OR IGNORE INTO cars (slug,title,make,model,year,price,mileage,fuel,power_kw,engine,transmission,euro_class,color,seats,description,options_json,images_json,status,featured) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    const batch = SEED.map(c=>env.DB.prepare(q).bind(...c.slice(0,15),JSON.stringify(c[15]),JSON.stringify(c[16]),c[17],c[18]));
    batch.push(env.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('seeded_v1','1')"));
    await env.DB.batch(batch);
  }
}
async function uniqueSlug(env,title,ignoreId=null){const base=slugify(title);let s=base;for(let i=0;i<50;i++){const hit=await env.DB.prepare('SELECT id FROM cars WHERE slug=?').bind(s).first();if(!hit || String(hit.id)===String(ignoreId))return s;s=`${base}-${i+2}`}return `${base}-${crypto.randomUUID().slice(0,8)}`}
async function parseBody(request){try{return await request.json()}catch{return {}}}

async function carsList(context){
  const {request,env}=context;
  if(request.method==='POST'){
    const blocked=deny(request,env); if(blocked)return blocked;
    await db(env); const c=carInput(await parseBody(request)); if(!c.title)return json({error:'TITLE_REQUIRED'},400);
    const slug=await uniqueSlug(env,c.title);
    const r=await env.DB.prepare(`INSERT INTO cars (slug,title,make,model,year,price,mileage,fuel,power_kw,engine,transmission,euro_class,color,seats,description,options_json,images_json,status,featured,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(slug,c.title,c.make,c.model,c.year,c.price,c.mileage,c.fuel,c.power_kw,c.engine,c.transmission,c.euro_class,c.color,c.seats,c.description,JSON.stringify(c.options),JSON.stringify(c.images),c.status,c.featured).run();
    const created=await env.DB.prepare('SELECT * FROM cars WHERE id=?').bind(r.meta.last_row_id).first(); return json(row(created),201);
  }
  if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
  await db(env); const result=await env.DB.prepare("SELECT * FROM cars ORDER BY featured DESC, CASE status WHEN 'available' THEN 0 ELSE 1 END, updated_at DESC, id DESC").all(); return json({cars:(result.results||[]).map(row)});
}

async function oneCar(context,id){
  const {request,env}=context; await db(env);
  const current=await env.DB.prepare('SELECT * FROM cars WHERE CAST(id AS TEXT)=? OR slug=? LIMIT 1').bind(id,id).first();
  if(request.method==='GET') return current ? json(row(current)) : json({error:'NOT_FOUND'},404);
  const blocked=deny(request,env); if(blocked)return blocked; if(!current)return json({error:'NOT_FOUND'},404);
  if(request.method==='DELETE'){
    await env.DB.prepare('DELETE FROM cars WHERE id=?').bind(current.id).run();
    if(env.CAR_IMAGES){for(const u of row(current).images||[]){if(String(u).startsWith('/media/')){try{await env.CAR_IMAGES.delete(decodeURIComponent(String(u).slice(7)))}catch{}}}}
    return json({ok:true});
  }
  if(request.method!=='PUT' && request.method!=='PATCH')return json({error:'METHOD_NOT_ALLOWED'},405);
  const c=carInput(await parseBody(request)); if(!c.title)return json({error:'TITLE_REQUIRED'},400); const slug=await uniqueSlug(env,c.title,current.id);
  await env.DB.prepare(`UPDATE cars SET slug=?,title=?,make=?,model=?,year=?,price=?,mileage=?,fuel=?,power_kw=?,engine=?,transmission=?,euro_class=?,color=?,seats=?,description=?,options_json=?,images_json=?,status=?,featured=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(slug,c.title,c.make,c.model,c.year,c.price,c.mileage,c.fuel,c.power_kw,c.engine,c.transmission,c.euro_class,c.color,c.seats,c.description,JSON.stringify(c.options),JSON.stringify(c.images),c.status,c.featured,current.id).run();
  return json(row(await env.DB.prepare('SELECT * FROM cars WHERE id=?').bind(current.id).first()));
}

async function login(context){if(context.request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);if(!context.env.ADMIN_PASSWORD)return json({error:'ADMIN_NOT_CONFIGURED',message:'Stel ADMIN_PASSWORD in bij Cloudflare Pages.'},503);const body=await parseBody(context.request);return txt(body.password,500)===context.env.ADMIN_PASSWORD?json({ok:true}):json({error:'UNAUTHORIZED'},401)}

async function upload(context){
  const {request,env}=context; if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405); const blocked=deny(request,env); if(blocked)return blocked; if(!env.CAR_IMAGES)return json({error:'R2_NOT_CONFIGURED',message:'Koppel een R2 bucket met variabelenaam CAR_IMAGES.'},503);
  const form=await request.formData(); const file=form.get('file'); if(!file || typeof file.arrayBuffer!=='function')return json({error:'FILE_REQUIRED'},400); if(file.size>10*1024*1024)return json({error:'FILE_TOO_LARGE'},413); if(file.type && !file.type.startsWith('image/'))return json({error:'IMAGE_REQUIRED'},415);
  const safe=String(file.name||'foto.jpg').toLowerCase().replace(/[^a-z0-9._-]+/g,'-').slice(-90); const key=`cars/${new Date().getUTCFullYear()}/${crypto.randomUUID()}-${safe}`;
  await env.CAR_IMAGES.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||'image/jpeg',cacheControl:'public, max-age=31536000, immutable'},customMetadata:{originalName:String(file.name||'')}}); return json({url:`/media/${key}`},201);
}

export async function onRequest(context){
  try{
    const p=new URL(context.request.url).pathname.split('/').filter(Boolean);
    if(p[0]!=='api')return json({error:'NOT_FOUND'},404);
    if(p[1]==='auth')return login(context);
    if(p[1]==='images')return upload(context);
    if(p[1]==='cars' && p.length===2)return carsList(context);
    if(p[1]==='cars' && p[2])return oneCar(context,decodeURIComponent(p.slice(2).join('/')));
    return json({error:'NOT_FOUND'},404);
  }catch(error){console.error(error);return error?.message==='DB_NOT_CONFIGURED'?json({error:'DB_NOT_CONFIGURED',message:'Koppel een D1 database met variabelenaam DB.'},503):json({error:'SERVER_ERROR'},500)}
}
