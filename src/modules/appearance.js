const defaults={navigationOrder:[],title:'Alle bots samlet',accent:'#7c6cff',background:'#0f1115',panel:'#171a21',text:'#e6e8ee',backgroundImage:'',density:'comfortable',radius:12};
function validate(input={}){
  const out={...defaults};
  for(const k of Object.keys(defaults))if(input[k]!==undefined)out[k]=input[k];
  if(typeof out.title!=='string'||!out.title.trim()||out.title.length>70)throw new Error('Sidens navn skal være 1–70 tegn');
  for(const k of ['accent','background','panel','text'])if(!/^#[0-9a-f]{6}$/i.test(out[k]))throw new Error('Ugyldig farve');
  if(typeof out.backgroundImage!=='string'||out.backgroundImage.length>2000)throw new Error('Ugyldig baggrund');
  if(out.backgroundImage){const url=new URL(out.backgroundImage);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Brug et HTTPS-link til baggrundsbilledet');}
  if(!['comfortable','compact'].includes(out.density))throw new Error('Ukendt tæthed');
  if(!Number.isInteger(out.radius)||out.radius<0||out.radius>30)throw new Error('Hjørner skal være 0–30');
  const allowed=['developer','overview','tickets','applications','music','moderation','welcome','levels','giveaways','stream','birthdays','slideshow','restart','custom','appearance','account'];
  if(!Array.isArray(out.navigationOrder)||out.navigationOrder.length>allowed.length||new Set(out.navigationOrder).size!==out.navigationOrder.length||out.navigationOrder.some(k=>!allowed.includes(k)))throw new Error('Ugyldig menurækkefølge');
  return out;
}
module.exports={defaults,validate};
