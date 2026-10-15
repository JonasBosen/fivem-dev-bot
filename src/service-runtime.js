// Keep the web listener available and recover from temporary database/login failures.
function createRuntime({initDb,probe,connect,isReady,log=console.warn,setTimer=setTimeout,clearTimer=clearTimeout}) {
  let timer,stopped=false,running=false,failures=0;
  const state={databaseReady:false,databaseError:''};
  async function tick(){
    if(stopped||running)return;running=true;
    try{
      try{await initDb();await probe();state.databaseReady=true;state.databaseError='';failures=0;}
      catch(error){state.databaseReady=false;state.databaseError=/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'DATABASE_CONNECTION_FAILED';failures++;log('[database]',state.databaseError);}
      if(state.databaseReady&&!isReady())try{await connect();}catch(error){log('[discord]',error.code||error.name||'LOGIN_FAILED');}
    }finally{running=false;if(!stopped){const delay=state.databaseReady&&isReady()?30000:Math.min(60000,5000*2**Math.min(failures,4));timer=setTimer(tick,delay);timer.unref?.();}}
  }
  return Object.assign(state,{start:tick,stop(){stopped=true;clearTimer(timer);}});
}
module.exports={createRuntime};
