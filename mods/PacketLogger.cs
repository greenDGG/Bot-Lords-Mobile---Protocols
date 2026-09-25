using MelonLoader;
using System;
using System.Collections.Generic;
using System.Reflection;
using HarmonyLib;
using System.Text;
using System.Runtime.InteropServices;
using UnityEngine;

[assembly: MelonInfo(typeof(PacketLoggerMod.PacketLogger), "PacketLogger", "12.14.0", "green")]
[assembly: MelonGame("IGG", "Lords Mobile")]

namespace PacketLoggerMod;

public class PacketLogger : MelonMod
{
    static byte[] _prefixData;
    static int _prefixSize;
    static int _prefixOffset;
    static int _pktCount;
    static readonly HashSet<int> _filteredProtos = new() { 1024, 1025, 2859 };

    // ── Teclado y envío ──
    static uint _gameSeq = 1;
    static bool _seqInitialized = false;
    static float _lastKeyTime = 0f;
    static readonly float _keyDelay = 0.15f;

    // ── Custom packet injection ──
    static bool _sendCustomPacket = false;
    static ushort _customProto = 0;
    static byte[] _customBody = null;

    public override void OnInitializeMelon()
    {
        MelonLogger.Msg("PacketLogger v12.14 cargando...");

        try
        {
            MelonLogger.Msg("Buscando NetworkManager.Cipher...");
            var t = AccessTools.TypeByName("NetworkManager");
            if (t == null) { MelonLogger.Error("NetworkManager no encontrado"); return; }

            var m = AccessTools.Method(t, "Cipher");
            if (m == null) { MelonLogger.Error("NetworkManager.Cipher no encontrado"); return; }

            MelonLogger.Msg($"Cipher encontrado: {m.Name} en {m.DeclaringType}");

            var harmony = new HarmonyLib.Harmony("PacketLogger.CipherHook");
            harmony.Patch(m,
                prefix: new HarmonyMethod(typeof(PacketLogger).GetMethod("Prefix", BindingFlags.Static | BindingFlags.NonPublic)),
                postfix: new HarmonyMethod(typeof(PacketLogger).GetMethod("Postfix", BindingFlags.Static | BindingFlags.NonPublic))
            );
            MelonLogger.Msg("Hook Cipher instalado");

            MelonLogger.Msg("=== TECLADO: Presiona L para enviar proto 6801 ===");
        }
        catch (Exception ex)
        {
            MelonLogger.Error($"Error en hook: {ex.GetType().Name}: {ex.Message}");
            MelonLogger.Error($"StackTrace: {ex.StackTrace}");
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  FUNCION 1: Test de teclado - captura cualquier tecla y la muestra en consola
    // ══════════════════════════════════════════════════════════════
    public override void OnUpdate()
    {
        if (Time.time - _lastKeyTime < _keyDelay) return;

        // L: Queue custom packet for injection on next OUT
        if (Input.GetKeyDown(KeyCode.L))
        {
            _customProto = 6801;
            _customBody = new byte[] { 0x02 };
            _sendCustomPacket = true;
            MelonLogger.Msg($"[CMD] Custom packet queued: proto=6801 body=02 (will inject on next OUT)");
            _lastKeyTime = Time.time;
            return;
        }

        // Detectar cualquier tecla presionada y mostrarla
        if (Input.anyKeyDown)
        {
            foreach (KeyCode code in Enum.GetValues(typeof(KeyCode)))
            {
                if (Input.GetKeyDown(code))
                {
                    string seqInfo = _seqInitialized ? $" | gameSeq={_gameSeq}" : " | seq no detectado";
                    MelonLogger.Msg($"[TEST] Tecla: {code}{seqInfo}");
                    _lastKeyTime = Time.time;
                    break;
                }
            }
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  HOOKS EXISTENTES (sin cambios)
    // ══════════════════════════════════════════════════════════════

    static void HookDmMethod(HarmonyLib.Harmony harmony, Type dmType, string methodName, string handlerName)
    {
        try
        {
            var m = dmType.GetMethod(methodName, BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static);
            if (m == null) { MelonLogger.Warning($"Hook {methodName}: not found"); return; }
            harmony.Patch(m, postfix: new HarmonyMethod(typeof(PacketLogger).GetMethod(handlerName, BindingFlags.Static | BindingFlags.NonPublic)));
            MelonLogger.Msg($"Hook {methodName} instalado -> {handlerName}");
        }
        catch (Exception ex) { MelonLogger.Error($"Hook {methodName} error: {ex.Message}"); }
    }

    static void AfterRecvAllBuildData()
    {
        MelonLogger.Msg("=== RecvAllBuildData CALLED ===");
        DumpAllBuildings();
    }

    static void DumpAllBuildings()
    {
        try
        {
            var dmType = AccessTools.TypeByName("DataManager");
            if (dmType == null) return;
            object dm = GetDataManagerInstance(dmType);
            if (dm == null) return;

            var fBuildData = dmType.GetField("BuildingData", BindingFlags.Public | BindingFlags.Instance);
            if (fBuildData == null) { MelonLogger.Warning("BuildingData field not found"); return; }
            object bd = fBuildData.GetValue(dm);
            if (bd == null) { MelonLogger.Warning("BuildingData is null"); return; }

            var fAllBuilds = bd.GetType().GetField("AllBuildsData", BindingFlags.Public | BindingFlags.Instance);
            if (fAllBuilds == null) { MelonLogger.Warning("AllBuildsData field not found"); return; }
            object arr = fAllBuilds.GetValue(bd);
            if (arr == null) { MelonLogger.Warning("AllBuildsData is null"); return; }

            var lenProp = arr.GetType().GetProperty("Length");
            if (lenProp == null) return;
            int len = (int)lenProp.GetValue(arr);
            MelonLogger.Msg($"AllBuildsData length={len}");

            for (int i = 0; i < len; i++)
            {
                var idxProp = arr.GetType().GetProperty("Item");
                if (idxProp == null) break;
                object entry = idxProp.GetValue(arr, new object[] { i });
                if (entry == null) continue;
                DumpRoleBuildingData(entry, i);
            }
        }
        catch (Exception ex) { MelonLogger.Error($"DumpAllBuildings error: {ex.Message}"); }
    }

    static void DumpRoleBuildingData(object entry, int index)
    {
        try
        {
            var t = entry.GetType();
            int idx = (int)t.GetField("Index").GetValue(entry);
            byte level = (byte)t.GetField("Level").GetValue(entry);
            object buildId = t.GetField("_BuildID").GetValue(entry);
            int buildIdVal = Convert.ToInt32(buildId);
            object pos = t.GetField("Position").GetValue(entry);
            bool initPos = (bool)t.GetField("bInitPos").GetValue(entry);
            bool derelict = (bool)t.GetField("IsDerelict").GetValue(entry);

            int posX = 0, posY = 0;
            if (pos != null)
            {
                var fX = pos.GetType().GetField("x") ?? pos.GetType().GetField("X");
                var fY = pos.GetType().GetField("y") ?? pos.GetType().GetField("Y");
                if (fX != null) posX = Convert.ToInt32(fX.GetValue(pos));
                if (fY != null) posY = Convert.ToInt32(fY.GetValue(pos));
            }

            MelonLogger.Msg($"  B[{index}] idx={idx} buildId={buildIdVal} lv={level} pos=({posX},{posY}) init={initPos} derelict={derelict}");
        }
        catch (Exception ex) { MelonLogger.Warning($"  B[{index}] error: {ex.Message}"); }
    }

    static void AfterDailySignIn()
    {
        MelonLogger.Msg("=== DailySignIn SIGNIN CALLED ===");
        DumpDailySignData();
    }

    static void DumpDailySignData()
    {
        try
        {
            var dmType = AccessTools.TypeByName("DataManager");
            if (dmType == null) return;
            object dm = GetDataManagerInstance(dmType);
            if (dm == null) return;

            var fDsm = dmType.GetField("DailySignManager", BindingFlags.Public | BindingFlags.Instance);
            if (fDsm == null) { MelonLogger.Warning("DataManager.DailySignManager field not found"); return; }
            object dsm = fDsm.GetValue(dm);
            if (dsm == null) { MelonLogger.Warning("DailySignManager is null"); return; }

            var fData = dsm.GetType().GetField("mDailySignData", BindingFlags.Public | BindingFlags.Instance);
            if (fData == null) { MelonLogger.Warning("mDailySignData field not found"); return; }
            object data = fData.GetValue(dsm);
            if (data == null) { MelonLogger.Warning("mDailySignData is null"); return; }

            MelonLogger.Msg($"DailySignData type={data.GetType().FullName}");
            foreach (var f in data.GetType().GetFields(BindingFlags.Public | BindingFlags.Instance))
            {
                object val = f.GetValue(data);
                MelonLogger.Msg($"  {f.Name} = {val} ({f.FieldType.Name})");
            }

            var fReturn = dsm.GetType().GetField("returnSignUpData", BindingFlags.Public | BindingFlags.Instance);
            if (fReturn != null)
            {
                object ret = fReturn.GetValue(dsm);
                if (ret != null)
                {
                    MelonLogger.Msg("returnSignUpData:");
                    foreach (var f in ret.GetType().GetFields(BindingFlags.Public | BindingFlags.Instance))
                    {
                        object val = f.GetValue(ret);
                        MelonLogger.Msg($"  {f.Name} = {val} ({f.FieldType.Name})");
                    }
                }
            }
        }
        catch (Exception ex) { MelonLogger.Error($"DumpDailySignData error: {ex.Message}"); }
    }

    static void AfterRecvTech(object MP)
    {
        ushort protoNum = 0;
        try
        {
            if (MP != null)
            {
                var t = MP.GetType();
                var fProto = t.GetField("_protoID_", BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic);
                if (fProto == null) fProto = t.GetField("protoID", BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic);
                if (fProto == null) fProto = t.GetField("proto", BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic);
                if (fProto != null)
                {
                    object val = fProto.GetValue(MP);
                    protoNum = Convert.ToUInt16(val);
                }
            }
        }
        catch { }

        if (protoNum != 0)
            MelonLogger.Msg($"RecvTechnologyInfo called (triggered by proto={protoNum})! Dumping AllTechData...");
        else
            MelonLogger.Msg("RecvTechnologyInfo called! Dumping AllTechData...");
        DumpAllTechData();
    }

    static void AfterCrypt() { MelonLogger.Msg("=== CRYPT INFO RECEIVED ==="); DumpCryptField("Crypt"); }
    static void AfterCryptStart() { MelonLogger.Msg("=== CRYPT START RECEIVED ==="); DumpCryptField("CryptStart"); }
    static void AfterCryptCancel() { MelonLogger.Msg("=== CRYPT CANCEL RECEIVED ==="); DumpCryptField("CryptCancel"); }
    static void AfterCryptReward() { MelonLogger.Msg("=== CRYPT REWARD RECEIVED ==="); DumpCryptField("CryptReward"); }

    static void DumpCryptField(string label)
    {
        try
        {
            var dmType = AccessTools.TypeByName("DataManager");
            if (dmType == null) return;
            object dm = GetDataManagerInstance(dmType);
            if (dm == null) return;

            var fCrypt = dmType.GetField("m_CryptData", BindingFlags.Public | BindingFlags.Instance);
            if (fCrypt == null) { MelonLogger.Warning($"{label}: m_CryptData field not found"); return; }
            object crypt = fCrypt.GetValue(dm);
            if (crypt == null) { MelonLogger.Msg($"{label}: m_CryptData is null"); return; }

            MelonLogger.Msg($"{label}: m_CryptData={crypt.GetType().FullName}");
            var allFields = crypt.GetType().GetFields(BindingFlags.Public | BindingFlags.Instance);
            foreach (var f in allFields)
            {
                object val = f.GetValue(crypt);
                MelonLogger.Msg($"  {f.Name} = {val} ({f.FieldType.Name})");
            }
            var allProps = crypt.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance);
            foreach (var p in allProps)
            {
                try { object val = p.GetValue(crypt); MelonLogger.Msg($"  {p.Name} = {val} ({p.PropertyType.Name})"); }
                catch { }
            }
        }
        catch (Exception ex) { MelonLogger.Error($"{label} error: {ex.Message}"); }
    }

    static void AfterDailyReset() { MelonLogger.Msg("=== DAILY RESET RECEIVED ==="); DumpConnectionData(); }
    static void AfterCheckDailyReset() { MelonLogger.Msg("=== checkDailyReset CALLED ==="); }

    static void AfterSetDailyResetTimer()
    {
        try
        {
            var dmType = AccessTools.TypeByName("DataManager");
            if (dmType == null) return;
            object dm = GetDataManagerInstance(dmType);
            if (dm == null) return;
            var getter = dmType.GetMethod("get_DailyResetTimer", BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static);
            if (getter == null) return;
            object val = getter.Invoke(dm, null);
            if (val != null)
            {
                long ts = Convert.ToInt64(val);
                var dt = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddSeconds(ts).ToLocalTime();
                MelonLogger.Msg($"=== DailyResetTimer = {ts} ({dt:yyyy-MM-dd HH:mm:ss}) ===");
            }
        }
        catch (Exception ex) { MelonLogger.Error($"AfterSetDailyResetTimer error: {ex.Message}"); }
    }

    static object GetDataManagerInstance(Type dmType)
    {
        object dm = dmType.GetProperty("Instance", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
        if (dm == null) dm = dmType.GetField("Instance", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
        return dm;
    }

    static void DumpConnectionData()
    {
        try
        {
            var cdType = AccessTools.TypeByName("ConnectionData");
            if (cdType == null) return;
            object cd = cdType.GetProperty("Instance", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
            if (cd == null) cd = cdType.GetField("Instance", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
            if (cd == null)
            {
                var fReset = cdType.GetField("resetTime", BindingFlags.Public | BindingFlags.Static);
                if (fReset != null) MelonLogger.Msg($"  resetTime (static) = {fReset.GetValue(null)}");
                var fBegin = cdType.GetField("resetTimeBegin", BindingFlags.Public | BindingFlags.Static);
                if (fBegin != null) MelonLogger.Msg($"  resetTimeBegin (static) = {fBegin.GetValue(null)}");
                return;
            }
            foreach (var f in cdType.GetFields(BindingFlags.Public | BindingFlags.Instance))
            {
                object val = f.GetValue(cd);
                MelonLogger.Msg($"  ConnectionData.{f.Name} = {val} ({f.FieldType.Name})");
            }
        }
        catch (Exception ex) { MelonLogger.Error($"DumpConnectionData error: {ex.Message}"); }
    }

    static byte[] CopyArray(object codon)
    {
        try
        {
            var t = codon.GetType();
            var lenProp = t.GetProperty("Length") ?? t.GetProperty("Count");
            var idxProp = t.GetProperty("Item");
            if (lenProp == null || idxProp == null) return null;
            int totalLen = (int)lenProp.GetValue(codon);
            if (totalLen <= 0 || totalLen > 1000000) return null;
            byte[] arr = new byte[totalLen];
            for (int i = 0; i < totalLen; i++)
                arr[i] = (byte)idxProp.GetValue(codon, new object[] { i });
            return arr;
        }
        catch { return null; }
    }

    static void DumpAllTechData()
    {
        try
        {
            var dmType = AccessTools.TypeByName("DataManager");
            if (dmType == null) { return; }

            var getter = dmType.GetMethod("get_AllTechData", BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static);
            if (getter == null) { return; }

            object dm = GetDataManagerInstance(dmType);
            if (dm == null) { return; }

            object result = getter.Invoke(dm, null);
            if (result == null) { return; }

            var lenProp = result.GetType().GetProperty("Length");
            var idxProp = result.GetType().GetProperty("Item");
            if (lenProp == null || idxProp == null) { MelonLogger.Warning("Dump: no Length/Item props"); return; }

            int len = (int)lenProp.GetValue(result);
            if (len <= 0) { return; }

            StringBuilder hexChunks = new StringBuilder();
            for (int c = 0; c < len; c += 60)
            {
                hexChunks.Clear();
                hexChunks.Append($"AllTechData[{c}]: ");
                for (int i = c; i < Math.Min(c + 60, len); i++)
                {
                    byte val = (byte)idxProp.GetValue(result, new object[] { i });
                    hexChunks.Append($"{val:x2}");
                }
                MelonLogger.Msg(hexChunks.ToString());
            }

            StringBuilder sb = new StringBuilder();
            sb.Append("Tech 1-30 bytes: ");
            for (int i = 1; i <= 30; i++)
            {
                byte val = (byte)idxProp.GetValue(result, new object[] { i });
                sb.Append($"T{i}=0x{val:x2}({val}) ");
            }
            MelonLogger.Msg(sb.ToString());

            sb.Clear();
            sb.Append("Tech 95-98 bytes: ");
            for (int i = 95; i <= 98; i++)
            {
                byte val = (byte)idxProp.GetValue(result, new object[] { i });
                sb.Append($"T{i}=0x{val:x2}({val}) ");
            }
            MelonLogger.Msg(sb.ToString());

            sb.Clear();
            sb.Append("Tech1-30 (state,level): ");
            for (int i = 1; i <= 30; i++)
            {
                byte val = (byte)idxProp.GetValue(result, new object[] { i });
                int state = (val >> 4) & 0x0F;
                int level = val & 0x0F;
                if (level > 0 || state > 0)
                    sb.Append($"T{i}(st={state},lv={level}) ");
            }
            MelonLogger.Msg(sb.ToString());
        }
        catch (Exception ex)
        {
            MelonLogger.Error($"Dump error: {ex.GetType().Name}: {ex.Message}");
        }
    }

    static void Prefix(object Codon, int Offset, int Size, int Durex)
    {
        try
        {
            if (Codon == null || Size < 1) return;

            // ── Custom packet injection on OUT ──
            if (Durex == 1024 && _sendCustomPacket && _customBody != null)
            {
                try
                {
                    // Wire format in Codon[Offset..]: [len:2][proto:2][seq:4][body]
                    int totalLen = 2 + 2 + 4 + _customBody.Length;
                    var t = Codon.GetType();
                    var idxProp = t.GetProperty("Item");
                    if (idxProp != null)
                    {
                        // Write length (LE)
                        idxProp.SetValue(Codon, (byte)(totalLen & 0xFF), new object[] { Offset + 0 });
                        idxProp.SetValue(Codon, (byte)((totalLen >> 8) & 0xFF), new object[] { Offset + 1 });

                        // Write proto (LE)
                        idxProp.SetValue(Codon, (byte)(_customProto & 0xFF), new object[] { Offset + 2 });
                        idxProp.SetValue(Codon, (byte)((_customProto >> 8) & 0xFF), new object[] { Offset + 3 });

                        // Write body
                        for (int i = 0; i < _customBody.Length; i++)
                            idxProp.SetValue(Codon, _customBody[i], new object[] { Offset + 8 + i });

                        MelonLogger.Msg($"[INJECT] Injected proto={_customProto} body={Convert.ToHexString(_customBody).ToLower()} len={totalLen}");
                    }

                    _sendCustomPacket = false;
                    _customBody = null;
                }
                catch (Exception ex)
                {
                    MelonLogger.Error($"[INJECT] Error: {ex.Message}");
                    _sendCustomPacket = false;
                    _customBody = null;
                }
            }

            byte[] data = CopyArray(Codon);
            if (data == null) return;

            if (Durex == 0)
            {
                _pktCount++;
                _prefixData = (byte[])data.Clone();
                _prefixOffset = Offset;
                _prefixSize = Size;
            }
            else if (Durex == 1024)
            {
                _prefixData = (byte[])data.Clone();
                _prefixOffset = Offset;
                _prefixSize = Size;
            }
        }
        catch (Exception ex)
        {
            MelonLogger.Error($"Prefix error: {ex.Message}");
        }
    }

    static void Postfix(object Codon, int Offset, int Size, int Durex)
    {
        try
        {
            if (Size < 1 || _prefixData == null) return;
            byte[] post = CopyArray(Codon);
            if (post == null) return;

            _pktCount++;
            string dir = Durex == 0 ? "IN" : Durex == 1024 ? "OUT" : "??";

            if (Durex == 0)
            {
                ushort proto = post.Length >= 4 ? (ushort)(post[2] | (post[3] << 8)) : (ushort)0;
                if (_filteredProtos.Contains(proto)) { _prefixData = null; return; }
                int encSize = Math.Min(_prefixSize, _prefixData.Length - _prefixOffset);
                string encHex = encSize > 0 ? Convert.ToHexString(_prefixData, _prefixOffset, encSize).ToLower() : "";
                ushort pktLen = post.Length >= 2 ? (ushort)(post[0] | (post[1] << 8)) : (ushort)0;
                int showSize = Math.Min(pktLen > 0 ? pktLen : Size, post.Length);
                string decHex = Convert.ToHexString(post, 0, showSize).ToLower();
                MelonLogger.Msg($"#{_pktCount} {dir} proto={proto} size={showSize}");
                if (decHex.Length > 500)
                {
                    for (int ci = 0; ci < decHex.Length; ci += 500)
                        MelonLogger.Msg($"  [{ci/2}]: {decHex.Substring(ci, Math.Min(500, decHex.Length - ci))}");
                }
                else
                    MelonLogger.Msg($"  hex: {decHex}");
                if (encHex.Length > 0)
                    MelonLogger.Msg($"  enc: {encHex}");
            }
            else if (Durex == 1024)
            {
                var pt = new byte[_prefixSize];
                Array.Copy(_prefixData, _prefixOffset, pt, 0, _prefixSize);

                ushort proto = _prefixData.Length >= 4 ? (ushort)(_prefixData[2] | (_prefixData[3] << 8)) : (ushort)0;

                // Incrementar seq por cada paquete OUT
                _seqInitialized = true;
                _gameSeq++;

                if (_filteredProtos.Contains(proto)) { _prefixData = null; return; }

                string plainHex = Convert.ToHexString(pt).ToLower();

                int encSize = Math.Min(_prefixSize, post.Length - _prefixOffset);
                string encHex = Convert.ToHexString(post, _prefixOffset, encSize).ToLower();

                string injectTag = (proto == _customProto || proto == 6801) ? " [INJECTED]" : "";
                MelonLogger.Msg($"#{_pktCount} {dir} proto={proto} size={_prefixSize} plain_len={plainHex.Length/2}{injectTag}");
                if (plainHex.Length > 500)
                {
                    for (int ci = 0; ci < plainHex.Length; ci += 500)
                        MelonLogger.Msg($"  plain[{ci/2}]: {plainHex.Substring(ci, Math.Min(500, plainHex.Length - ci))}");
                }
                else
                    MelonLogger.Msg($"  plain: {plainHex}");
                if (encHex.Length > 500)
                {
                    for (int ci = 0; ci < encHex.Length; ci += 500)
                        MelonLogger.Msg($"  enc[{ci/2}]: {encHex.Substring(ci, Math.Min(500, encHex.Length - ci))}");
                }
                else
                    MelonLogger.Msg($"  enc: {encHex}");
            }

            _prefixData = null;
        }
        catch (Exception ex)
        {
            MelonLogger.Error($"Postfix error: {ex.Message}");
        }
    }
}
