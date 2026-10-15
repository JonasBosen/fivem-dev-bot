local endpoint = GetConvar('allbot_txadmin_url', '')
local key = GetConvar('allbot_txadmin_key', '')
local configured = endpoint:match('^https://') and #key == 64
local bootId = tostring(os.time()) .. '-' .. tostring(math.random(100000, 999999))
local sequence = 0
local queue, working = {}, false

local function drain()
    if working or #queue == 0 then return end
    working = true
    local item = table.remove(queue, 1)
    local function send(attempt)
        PerformHttpRequest(endpoint, function(status)
            if (status == 0 or status == 429 or status >= 500) and attempt < 3 then
                SetTimeout(attempt * 2000, function() send(attempt + 1) end)
                return
            end
            if status < 200 or status >= 300 then
                print(('[allbot_txadmin] Levering fejlede (HTTP %s). Kontroller URL, noegle og aktivering i panelet.'):format(status))
            end
            working = false
            drain()
        end, 'POST', json.encode(item), {['Content-Type'] = 'application/json', ['Authorization'] = 'Bearer ' .. key}, {followLocation = false})
    end
    send(1)
end

local function report(kind, seconds)
    if not configured then return end
    sequence = sequence + 1
    local item = {type = kind, bootId = bootId, seq = sequence, sentAt = os.time() * 1000, players = #GetPlayers(), maxPlayers = GetConvarInt('sv_maxclients', 48)}
    if seconds then item.secondsRemaining = math.max(0, math.floor(seconds)) end
    -- En langsom forbindelse maa ikke opbygge en uendelig ko af hjerteslag.
    if kind == 'heartbeat' then
        for i = #queue, 1, -1 do if queue[i].type == 'heartbeat' then table.remove(queue, i) end end
    end
    queue[#queue + 1] = item
    drain()
end

AddEventHandler('txAdmin:events:scheduledRestart', function(data)
    if type(data) == 'table' and type(data.secondsRemaining) == 'number' then report('restart', data.secondsRemaining) end
end)
AddEventHandler('txAdmin:events:scheduledRestartSkipped', function() report('restart_cancelled') end)
AddEventHandler('txAdmin:events:serverShuttingDown', function() report('shutdown') end)
CreateThread(function()
    if not configured then
        print('[allbot_txadmin] Mangler gyldig HTTPS-URL eller forbindelsesnoegle. Brug konfigurationen fra FiveM / txAdmin i panelet.')
        return
    end
    while true do report('heartbeat'); Wait(30000) end
end)
