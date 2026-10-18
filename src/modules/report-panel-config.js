const {categories}=require('./report-categories');
const defaults={text:'🛠️ **Opret udvikler ticket**\nTryk for at indsende en sag med beskrivelse og billede. Du får status og svar privat.',buttons:[{label:'Opret udvikler ticket',emoji:'',color:'blue',category:'choose'}]};
function validate(input){
 if(!input||typeof input.text!=='string'||!input.text.trim()||input.text.length>2000)throw new Error('Panelteksten skal være 1–2000 tegn');
 if(!Array.isArray(input.buttons)||input.buttons.length>25)throw new Error('Der må højst være 25 knapper');
 return {text:input.text,buttons:input.buttons.map(b=>{if(!b||typeof b.label!=='string'||!b.label.trim()||b.label.length>80)throw new Error('Knappens tekst skal være 1–80 tegn');if(!['blue','green','red','gray'].includes(b.color))throw new Error('Vælg en Discord-knapfarve');if(!['choose',...categories.map(c=>c.id)].includes(b.category))throw new Error('Vælg en kategori');if(typeof b.emoji!=='string'||b.emoji.length>100||b.emoji&&!/^((<a?:[a-zA-Z0-9_]+:[0-9]{17,20}>)|([0-9]{17,20})|([\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u200D\u20E3#*0-9]+))$/u.test(b.emoji))throw new Error('Brug en emoji eller en Discord-emoji som <:navn:id>');if(b.reportType!==undefined&&!['bug','request'].includes(b.reportType))throw new Error('Vælg fejlmelding eller ønske');return {label:b.label.trim(),emoji:b.emoji,color:b.color,category:b.category,reportType:b.reportType||'bug'};})};
}
module.exports={defaults,validate};
