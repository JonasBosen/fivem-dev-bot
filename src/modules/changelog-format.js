// Keep custom Discord emoji markup separate from the public notes sent to AI.
const path=require('node:path');
const pending=new WeakMap();
const colors={red:'dn_check_red',green:'dn_check_green',orange:'dn_check_orange'};
async function ensure(client){
 const manager=client?.application?.emojis;
 if(!manager)throw Error('Botforbindelsen til changelog-emojis er ikke klar');
 if(pending.has(manager))return pending.get(manager);
 const work=(async()=>{const existing=await manager.fetch(),out={};for(const [color,name]of Object.entries(colors)){const emoji=existing.find(e=>e.name===name)||await manager.create({name,attachment:path.join(__dirname,'../web/public/assets/changelog',color+'-check.png')});out[color]='<:'+name+':'+emoji.id+'>';}return out;})();
 pending.set(manager,work);try{return await work;}catch(error){pending.delete(manager);throw error;}
}
function topic(text){
 if(/(?<!\p{L})(mlo|mapping|bygning\p{L}*|interiør\p{L}*|ejendom\p{L}*|hus|huse)(?!\p{L})/iu.test(text))return '🏢';
 if(/(?<!\p{L})(bil\p{L}*|køretøj\p{L}*|garage\p{L}*|motor\p{L}*|vehicle\p{L}*)(?!\p{L})/iu.test(text))return '🚗';
 if(/(?<!\p{L})(politi\p{L}*|betjent\p{L}*)(?!\p{L})/iu.test(text))return '🚓';
 if(/(?<!\p{L})(ambulance\p{L}*|hospital\p{L}*|læge\p{L}*)(?!\p{L})/iu.test(text))return '🚑';
 if(/(?<!\p{L})(job\p{L}*|arbejd\p{L}*|firma\p{L}*)(?!\p{L})/iu.test(text))return '💼';
 if(/(?<!\p{L})(økonomi\p{L}*|penge\p{L}*|bank\p{L}*|pris\p{L}*)(?!\p{L})/iu.test(text))return '💰';
 if(/(?<!\p{L})(tøj\p{L}*|outfit\p{L}*|beklædning\p{L}*)(?!\p{L})/iu.test(text))return '👕';
 if(/(?<!\p{L})(discord\p{L}*|ticket\p{L}*|support\p{L}*)(?!\p{L})/iu.test(text))return '💬';
 if(/(?<!\p{L})(performance|optimer\p{L}*|fps|hastighed\p{L}*)(?!\p{L})/iu.test(text))return '⚡';
 return '';
}
function format(content,emojis){return content.replace(/\r\n?/g,'\n').split('\n').map(line=>{
 const match=line.match(/^\s*(?:[-*•]\s*)?(🔴|🟢|🟡|🟠|<:dn_check_(red|green|orange):\d+>)\s*(.*)$/u);
 if(!match)return line;
 const color=match[2]||({'🔴':'red','🟢':'green','🟡':'orange','🟠':'orange'})[match[1]],body=match[3].trim();
 const subject=topic(body),hasTopic=/^\p{Extended_Pictographic}/u.test(body);
 return (emojis?.[color]||({red:'🔴',green:'🟢',orange:'🟠'})[color])+' '+(subject&&!hasTopic?subject+' ':'')+body;
 }).join('\n');}
module.exports={ensure,format,topic,colors};
