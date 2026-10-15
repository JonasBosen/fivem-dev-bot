function taskLane(task){return task.status==='todo'&&task.planning?.priority==='critical'?'critical':task.status;}
function localDateValue(date){const d=new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function localDateTimeValue(value){if(!value)return '';const d=new Date(value);return localDateValue(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function developerCalendar({getTasks,onOpen,onSchedule,draggedTask,canMove,onDrag=()=>{}}){
  const calendar=h('div',{class:'dev-calendar'}),label=h('h2'),days=h('div',{class:'dev-calendar-days'}),agenda=h('div',{class:'calendar-agenda'});
  let anchor=new Date();
  const display=new Intl.DateTimeFormat('da-DK',{weekday:'short',day:'numeric',month:'short'});
  function monday(){const d=new Date(anchor);d.setDate(d.getDate()-((d.getDay()+6)%7));d.setHours(0,0,0,0);return d;}
  function draw(){
    const start=monday(),end=new Date(start);end.setDate(end.getDate()+6);label.textContent=display.format(start)+' – '+display.format(end);
    const tasks=getTasks().filter(t=>!t.planning?.archived);
    const visible=tasks.filter(t=>t.planning?.scheduledStart);
    days.replaceChildren(...Array.from({length:7},(_,n)=>{
      const day=new Date(start);day.setDate(day.getDate()+n);const key=localDateValue(day);
      const items=visible.filter(t=>localDateValue(t.planning.scheduledStart)===key).sort((a,b)=>a.planning.scheduledStart.localeCompare(b.planning.scheduledStart));
      return h('section',{class:'calendar-day'+(key===localDateValue(new Date())?' today':''),'data-date':key,ondragover:e=>{e.preventDefault();e.dataTransfer.dropEffect='move';},ondrop:run(async e=>{e.preventDefault();const id=draggedTask()||Number(e.dataTransfer.getData('text/plain'));if(id&&canMove())await onSchedule(id,key);})},
        h('h3',{},display.format(day)),h('small',{class:'muted'},'Slip en sag her'),...items.map(t=>h('button',{class:'calendar-event status-'+taskLane(t),draggable:'true',ondragend:()=>onDrag(null),ondragstart:e=>{onDrag(t.id);e.dataTransfer.setData('text/plain',String(t.id));e.dataTransfer.effectAllowed='move';},onclick:run(()=>onOpen(t.id))},h('small',{},new Date(t.planning.scheduledStart).toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'})+' – '+new Date(t.planning.scheduledEnd).toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'})),h('b',{},'#'+t.id+' '+t.title),t.planning.priority==='critical'&&h('span',{class:'critical-text'},'🔴 Kritisk'))));
    }));
    const unplanned=tasks.filter(t=>!t.planning?.scheduledStart&&!['closed','rejected'].includes(t.status));
    agenda.replaceChildren(h('h3',{},'Uden kalenderaftale · '+unplanned.length),h('p',{class:'muted'},'Træk en sag til en dag. Den får kl. 09.00 som udgangspunkt; åbn sagen for at vælge præcis start og slut. Aftalen vises til borgeren i dansk tid.'),h('div',{class:'unscheduled-cases'},...unplanned.map(t=>h('button',{class:'btn sec status-'+taskLane(t),draggable:'true',ondragstart:e=>{e.dataTransfer.setData('text/plain',String(t.id));e.dataTransfer.effectAllowed='move';},onclick:run(()=>onOpen(t.id))},'⠿ #'+t.id+' '+t.title))));
  }
  calendar.append(h('div',{class:'top'},label,h('div',{class:'actions'},h('button',{class:'btn sec',onclick:()=>{anchor.setDate(anchor.getDate()-7);draw();}},'← Forrige uge'),h('button',{class:'btn sec',onclick:()=>{anchor=new Date();draw();}},'I dag'),h('button',{class:'btn sec',onclick:()=>{anchor.setDate(anchor.getDate()+7);draw();}},'Næste uge →'))),days,agenda);
  draw();return {element:calendar,draw};
}
