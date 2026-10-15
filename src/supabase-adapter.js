const crypto = require('crypto');
const keyFor = sql => crypto.createHash('sha256').update(sql).digest('hex');
function createSupabaseAdapter(url, key) {
  if (new URL(url).hostname !== `${process.env.SUPABASE_PROJECT_REF || 'kdxxtdiydepuiecpdpha'}.supabase.co`) throw Object.assign(new Error('Supabase URL skal pege på det fælles projekt'),{code:'SUPABASE_PROJECT_MISMATCH'});
  const reads=new Map();
  async function request(sql, values = []) {
    const response = await fetch(`${url.replace(/\/$/,'')}/rest/v1/rpc/allbot_execute`, {
      method:'POST', headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({query_key:keyFor(sql),params:values}),signal:AbortSignal.timeout(20000),
    });
    if (!response.ok) throw Object.assign(new Error('Supabase-forbindelsen fejlede'),{code:'SUPABASE_HTTP_'+response.status});
    return response.json();
  }
  async function query(sql,values=[]){const read=sql.trimStart().toUpperCase().startsWith('SELECT '),id=JSON.stringify([sql,values]);if(read&&reads.has(id))return structuredClone(await reads.get(id));if(!read)reads.clear();const pending=request(sql,values);if(read)reads.set(id,pending);try{return structuredClone(await pending);}finally{if(read&&reads.get(id)===pending)reads.delete(id);if(!read)reads.clear();}}
  return {
    async init() { await query('SELECT data FROM settings WHERE guild_id = ?', ['__connection_check__']); },
    prepare(sql) {
      return {
        async get(...values) { return (await query(sql,values)).rows[0]; },
        async all(...values) { return (await query(sql,values)).rows; },
        async run(...values) { const result=await query(sql,values);return {changes:result.rowCount,lastInsertRowid:result.rows[0]?.id}; },
      };
    },
    async close() {},
  };
}
module.exports = { createSupabaseAdapter, keyFor };
