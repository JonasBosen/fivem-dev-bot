const categories=require('../web/public/report-categories.json');
function normalize(id='bug',custom='') {
  const category=categories.find(c=>c.id===id);
  if(!category)throw new Error('Vælg en gyldig kategori');
  if(typeof custom!=='string'||custom.length>100)throw new Error('Egen kategori må højst være 100 tegn');
  if(id==='other'&&!custom.trim())throw new Error('Du har valgt Andet. Skriv kategorien i feltet Andet: din egen kategori.');
  return {reportCategory:id,reportCategoryCustom:id==='other'?custom.trim():'',kind:category.kind};
}
function label(planning){return planning?.reportCategory==='other'?planning.reportCategoryCustom:categories.find(c=>c.id===planning?.reportCategory)?.label||'';}
module.exports={categories,normalize,label};
