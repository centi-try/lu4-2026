import React, { useState } from 'react';
import {
  Flag,
  Users,
  Plus,
  Pencil,
  Trash2,
  Shield,
  ChevronDown,
  ChevronRight,
  UserCheck,
  UserX,
  X,
  Crown,
  AlertTriangle,
  ArrowRightLeft,
  Swords,
} from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import type { RaidAccessInfo } from '../../components/RaidProtectedRoute';

interface Props {
  raidAccess?: RaidAccessInfo;
}

export default function RaidClansAndCps({ raidAccess }: Props) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const role = String(user?.role || '').toLowerCase();
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = isSuperAdmin || raidAccess?.accessLevel === 'raid_admin';

  // Data queries
  const clansQ = trpc.raid.clans.list.useQuery();
  const cpsQ = trpc.raid.commandParties.list.useQuery();
  const unassignedQ = trpc.raid.commandParties.unassigned.useQuery(undefined, { enabled: isSuperAdmin });

  const clans = (clansQ.data || []) as any[];
  const cps = (cpsQ.data || []) as any[];
  const unassigned = (unassignedQ.data || []) as any[];

  // Mutations
  const invalidateAll = () => {
    utils.raid.commandParties.invalidate();
  };

  const createCp = trpc.raid.commandParties.create.useMutation({
    onSuccess: () => { invalidateAll(); toast.success('CP creada'); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateCp = trpc.raid.commandParties.update.useMutation({
    onSuccess: () => { invalidateAll(); toast.success('CP actualizada'); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteCp = trpc.raid.commandParties.delete.useMutation({
    onSuccess: () => { invalidateAll(); toast.success('CP eliminada'); },
    onError: (e: any) => toast.error(e.message),
  });
  const setMemberStatus = trpc.raid.commandParties.setMemberStatus.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast.success('Estado actualizado');
    },
    onError: (e: any) => toast.error(e.message),
  });
  const reassignMember = trpc.raid.commandParties.reassignMember.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast.success('Miembro reasignado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // UI state
  const [expandedCps, setExpandedCps] = useState<Set<number>>(new Set());
  const [showCreateCp, setShowCreateCp] = useState(false);
  const [newCpName, setNewCpName] = useState('');
  const [newCpClanId, setNewCpClanId] = useState('');
  const [editingCp, setEditingCp] = useState<any | null>(null);
  const [editCpName, setEditCpName] = useState('');
  const [editCpLeaderId, setEditCpLeaderId] = useState<string>('');
  const [deleteConfirmCp, setDeleteConfirmCp] = useState<any | null>(null);
  const [reassignModal, setReassignModal] = useState<any | null>(null);
  const [reassignClanId, setReassignClanId] = useState('');
  const [reassignCpId, setReassignCpId] = useState('');

  // Confirmation modals
  const [confirmAction, setConfirmAction] = useState<{
    type: 'confirm_member' | 'remove_member' | 'reassign' | 'save_edit' | 'create_cp';
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const toggleCp = (cpId: number) => {
    setExpandedCps(prev => {
      const next = new Set(prev);
      if (next.has(cpId)) next.delete(cpId); else next.add(cpId);
      return next;
    });
  };

  const handleCreateCp = () => {
    if (!newCpName.trim() || !newCpClanId) return;
    const clanName = clans.find((c: any) => String(c.id) === newCpClanId)?.name || '';
    setConfirmAction({
      type: 'create_cp',
      title: 'Crear CP',
      message: `¿Crear la CP "${newCpName.trim()}" en el clan ${clanName}?`,
      confirmLabel: 'Crear',
      onConfirm: () => {
        createCp.mutate({ name: newCpName.trim(), clanId: Number(newCpClanId) });
        setNewCpName('');
        setNewCpClanId('');
        setShowCreateCp(false);
      },
    });
  };

  const handleEditCp = () => {
    if (!editingCp || !editCpName.trim()) return;
    setConfirmAction({
      type: 'save_edit',
      title: 'Guardar cambios',
      message: `¿Guardar los cambios en la CP "${editCpName.trim()}"?`,
      confirmLabel: 'Guardar',
      onConfirm: () => {
        updateCp.mutate({
          id: Number(editingCp.id),
          name: editCpName.trim(),
          leaderId: editCpLeaderId ? Number(editCpLeaderId) : null,
        });
        setEditingCp(null);
      },
    });
  };

  const handleDeleteCp = () => {
    if (!deleteConfirmCp) return;
    deleteCp.mutate({ id: Number(deleteConfirmCp.id) });
    setDeleteConfirmCp(null);
  };

  const handleReassign = () => {
    if (!reassignModal) return;
    const targetClan = clans.find((c: any) => String(c.id) === reassignClanId);
    const targetCp = cps.find((cp: any) => String(cp.id) === reassignCpId);
    setConfirmAction({
      type: 'reassign',
      title: 'Reasignar miembro',
      message: `¿Reasignar a ${reassignModal.characterName || reassignModal.name} al clan ${targetClan?.name || 'Sin clan'}${targetCp ? ` / ${targetCp.name}` : ''}?`,
      confirmLabel: 'Reasignar',
      onConfirm: () => {
        reassignMember.mutate({
          userId: Number(reassignModal.id),
          clanId: reassignClanId ? Number(reassignClanId) : null,
          cpId: reassignCpId ? Number(reassignCpId) : null,
        });
        setReassignModal(null);
      },
    });
  };

  const handleSetMemberStatus = (userId: number, memberName: string, status: 'confirmed' | 'removed') => {
    if (status === 'confirmed') {
      setConfirmAction({
        type: 'confirm_member',
        title: 'Confirmar miembro',
        message: `¿Confirmar a "${memberName}" como miembro de esta CP?`,
        confirmLabel: 'Confirmar',
        onConfirm: () => setMemberStatus.mutate({ userId, status }),
      });
    } else {
      setConfirmAction({
        type: 'remove_member',
        title: 'Sacar miembro',
        message: `¿Sacar a "${memberName}" de esta CP? Quedará sin asignación.`,
        confirmLabel: 'Sacar',
        danger: true,
        onConfirm: () => setMemberStatus.mutate({ userId, status }),
      });
    }
  };

  // Group CPs by clan
  const clanMap = new Map<number, { clan: any; cps: any[] }>();
  for (const clan of clans) {
    clanMap.set(Number(clan.id), { clan, cps: [] });
  }
  for (const cp of cps) {
    const entry = clanMap.get(Number(cp.clanId));
    if (entry) entry.cps.push(cp);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: 'rgba(232,121,249,0.15)', border: '1px solid rgba(232,121,249,0.3)' }}>
            <Shield className="h-5 w-5" style={{ color: '#e879f9' }} />
          </div>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Clanes & Command Parties
            </h2>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {clans.length} clan(es) · {cps.length} CP(s)
            </p>
          </div>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => setShowCreateCp(true)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
            style={{ background: 'rgba(232,121,249,0.15)', border: '1px solid rgba(232,121,249,0.3)', color: '#e879f9' }}
          >
            <Plus className="h-5 w-5" /> Nueva CP
          </button>
        )}
      </div>

      {/* Create CP form */}
      {showCreateCp && isSuperAdmin && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(232,121,249,0.06)', border: '1px solid rgba(232,121,249,0.2)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#e879f9' }}>Crear nueva CP</p>
          <div className="flex gap-3">
            <select
              value={newCpClanId}
              onChange={e => setNewCpClanId(e.target.value)}
              className="input-dark flex-1"
              style={{ appearance: 'none' }}
            >
              <option value="">Seleccionar clan...</option>
              {clans.map((c: any) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
            <input
              value={newCpName}
              onChange={e => setNewCpName(e.target.value)}
              placeholder="Nombre de la CP..."
              className="input-dark flex-1"
            />
            <button onClick={handleCreateCp} disabled={!newCpName.trim() || !newCpClanId}
              className="rounded-lg px-4 py-2 text-sm font-medium"
              style={{ background: 'rgba(232,121,249,0.2)', color: '#e879f9', opacity: (!newCpName.trim() || !newCpClanId) ? 0.4 : 1 }}>
              Crear
            </button>
            <button onClick={() => setShowCreateCp(false)} className="rounded-lg px-3 py-2"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)' }}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Clans + CPs tree */}
      {Array.from(clanMap.values()).map(({ clan, cps: clanCps }) => (
        <div key={clan.id} className="rounded-xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Clan header */}
          <div className="flex items-center gap-3 p-4"
            style={{ background: 'rgba(123,241,214,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <Flag className="h-6 w-6 shrink-0" style={{ color: '#7bf1d6' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: '#7bf1d6' }}>{clan.name}</p>
              {clan.tag && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>[{clan.tag}]</p>}
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded"
              style={{ background: 'rgba(123,241,214,0.1)', color: '#7bf1d6' }}>
              {clanCps.length} CP{clanCps.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* CPs list */}
          {clanCps.length === 0 && (
            <p className="p-4 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              No hay CPs creadas para este clan
            </p>
          )}
          {clanCps.map((cp: any) => (
            <CpRow
              key={cp.id}
              cp={cp}
              expanded={expandedCps.has(Number(cp.id))}
              onToggle={() => toggleCp(Number(cp.id))}
              isSuperAdmin={isSuperAdmin}
              isAdmin={isAdmin}
              currentUserId={Number(user?.id)}
              onEdit={() => {
                setEditingCp(cp);
                setEditCpName(cp.name);
                setEditCpLeaderId(cp.leaderId ? String(cp.leaderId) : '');
              }}
              onDelete={() => setDeleteConfirmCp(cp)}
              onSetMemberStatus={handleSetMemberStatus}
            />
          ))}
        </div>
      ))}

      {/* Unassigned users (super admin only) */}
      {isSuperAdmin && unassigned.length > 0 && (
        <div className="rounded-xl overflow-hidden"
          style={{ background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.15)' }}>
          <div className="flex items-center gap-3 p-4"
            style={{ borderBottom: '1px solid rgba(251,191,36,0.1)' }}>
            <AlertTriangle className="h-6 w-6" style={{ color: '#fbbf24' }} />
            <p className="text-sm font-semibold" style={{ color: '#fbbf24' }}>
              Usuarios sin CP ({unassigned.length})
            </p>
          </div>
          <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
            {unassigned.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between p-3 px-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full text-white text-[10px] font-bold"
                    style={{ background: 'rgba(251,191,36,0.2)' }}>
                    {(u.characterName || u.name || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>{u.characterName || u.name}</p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{u.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setReassignModal(u);
                    setReassignClanId(u.raidClanId ? String(u.raidClanId) : '');
                    setReassignCpId('');
                  }}
                  className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium"
                  style={{ background: 'rgba(232,121,249,0.15)', color: '#e879f9' }}
                >
                  <ArrowRightLeft className="h-4 w-4" /> Reasignar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit CP modal */}
      {editingCp && (
        <ModalOverlay onClose={() => setEditingCp(null)}>
          <EditCpModal
            cp={editingCp}
            cpName={editCpName}
            setCpName={setEditCpName}
            leaderId={editCpLeaderId}
            setLeaderId={setEditCpLeaderId}
            onSave={handleEditCp}
            onCancel={() => setEditingCp(null)}
          />
        </ModalOverlay>
      )}

      {/* Delete CP modal */}
      {deleteConfirmCp && (
        <ModalOverlay onClose={() => setDeleteConfirmCp(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: 'rgba(10,14,22,0.98)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ background: 'rgba(239,68,68,0.15)' }}>
                <Trash2 className="h-5 w-5" style={{ color: '#ef4444' }} />
              </div>
              <h3 className="text-base font-semibold" style={{ color: '#ef4444' }}>Eliminar CP</h3>
            </div>
            <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.6)' }}>
              ¿Eliminar <strong style={{ color: '#fff' }}>{deleteConfirmCp.name}</strong>? Los miembros quedarán sin CP asignada.
            </p>
            <p className="text-xs mb-4" style={{ color: 'rgba(239,68,68,0.7)' }}>
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmCp(null)}
                className="flex-1 py-2.5 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                Cancelar
              </button>
              <button onClick={handleDeleteCp}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                Eliminar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Reassign modal */}
      {reassignModal && (
        <ModalOverlay onClose={() => setReassignModal(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: 'rgba(10,14,22,0.98)', border: '1px solid rgba(232,121,249,0.2)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ background: 'rgba(232,121,249,0.15)' }}>
                <ArrowRightLeft className="h-5 w-5" style={{ color: '#e879f9' }} />
              </div>
              <h3 className="text-base font-semibold" style={{ color: '#e879f9' }}>
                Reasignar: {reassignModal.characterName || reassignModal.name}
              </h3>
            </div>
            <div className="space-y-3 mt-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Clan</label>
                <select value={reassignClanId} onChange={e => { setReassignClanId(e.target.value); setReassignCpId(''); }}
                  className="input-dark w-full" style={{ appearance: 'none' }}>
                  <option value="">Sin clan</option>
                  {clans.map((c: any) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </select>
              </div>
              {reassignClanId && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>CP</label>
                  <select value={reassignCpId} onChange={e => setReassignCpId(e.target.value)}
                    className="input-dark w-full" style={{ appearance: 'none' }}>
                    <option value="">Sin CP</option>
                    {cps.filter((cp: any) => Number(cp.clanId) === Number(reassignClanId)).map((cp: any) => (
                      <option key={cp.id} value={String(cp.id)}>{cp.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setReassignModal(null)}
                className="flex-1 py-2.5 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                Cancelar
              </button>
              <button onClick={handleReassign}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(232,121,249,0.2)', border: '1px solid rgba(232,121,249,0.3)', color: '#e879f9' }}>
                Reasignar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Generic confirmation modal */}
      {confirmAction && (
        <ModalOverlay onClose={() => setConfirmAction(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6"
            style={{
              background: 'rgba(10,14,22,0.98)',
              border: `1px solid ${confirmAction.danger ? 'rgba(239,68,68,0.3)' : 'rgba(232,121,249,0.2)'}`,
            }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ background: confirmAction.danger ? 'rgba(239,68,68,0.15)' : 'rgba(232,121,249,0.15)' }}>
                {confirmAction.danger
                  ? <AlertTriangle className="h-5 w-5" style={{ color: '#ef4444' }} />
                  : <Shield className="h-5 w-5" style={{ color: '#e879f9' }} />
                }
              </div>
              <h3 className="text-base font-semibold"
                style={{ color: confirmAction.danger ? '#ef4444' : '#e879f9' }}>
                {confirmAction.title}
              </h3>
            </div>
            <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {confirmAction.message}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)}
                className="flex-1 py-2.5 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                Cancelar
              </button>
              <button
                onClick={() => { confirmAction.onConfirm(); setConfirmAction(null); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{
                  background: confirmAction.danger ? 'rgba(239,68,68,0.2)' : 'rgba(232,121,249,0.2)',
                  border: `1px solid ${confirmAction.danger ? 'rgba(239,68,68,0.3)' : 'rgba(232,121,249,0.3)'}`,
                  color: confirmAction.danger ? '#ef4444' : '#e879f9',
                }}>
                {confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ---------- Edit CP Modal with leader dropdown ----------

function EditCpModal({
  cp, cpName, setCpName, leaderId, setLeaderId, onSave, onCancel,
}: {
  cp: any;
  cpName: string;
  setCpName: (v: string) => void;
  leaderId: string;
  setLeaderId: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const clanMembersQ = trpc.raid.commandParties.clanMembers.useQuery(
    { clanId: Number(cp.clanId) },
    { enabled: !!cp.clanId },
  );
  const clanMembers = (clanMembersQ.data || []) as any[];

  return (
    <div className="w-full max-w-sm rounded-2xl p-6"
      style={{ background: 'rgba(10,14,22,0.98)', border: '1px solid rgba(232,121,249,0.2)' }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: 'rgba(232,121,249,0.15)' }}>
          <Pencil className="h-5 w-5" style={{ color: '#e879f9' }} />
        </div>
        <h3 className="text-base font-semibold" style={{ color: '#e879f9' }}>Editar CP</h3>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Nombre</label>
          <input value={cpName} onChange={e => setCpName(e.target.value)}
            className="input-dark w-full" />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Leader</label>
          {clanMembersQ.isLoading ? (
            <p className="text-xs py-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Cargando miembros...</p>
          ) : (
            <select
              value={leaderId}
              onChange={e => setLeaderId(e.target.value)}
              className="input-dark w-full"
              style={{ appearance: 'none' }}
            >
              <option value="">Sin leader asignado</option>
              {clanMembers.map((m: any) => (
                <option key={m.id} value={String(m.id)}>
                  {m.characterName || m.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="flex gap-3 mt-5">
        <button onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-sm"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
          Cancelar
        </button>
        <button onClick={onSave}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(232,121,249,0.2)', border: '1px solid rgba(232,121,249,0.3)', color: '#e879f9' }}>
          Guardar
        </button>
      </div>
    </div>
  );
}

// ---------- CP Row with expandable member list ----------

function CpRow({
  cp, expanded, onToggle, isSuperAdmin, isAdmin, currentUserId,
  onEdit, onDelete, onSetMemberStatus,
}: {
  cp: any;
  expanded: boolean;
  onToggle: () => void;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  currentUserId: number;
  onEdit: () => void;
  onDelete: () => void;
  onSetMemberStatus: (userId: number, memberName: string, status: 'confirmed' | 'removed') => void;
}) {
  const membersQ = trpc.raid.commandParties.members.useQuery(
    { cpId: Number(cp.id) },
    { enabled: expanded },
  );
  const members = (membersQ.data || []) as any[];
  const isLeader = Number(cp.leaderId) === currentUserId;
  const canManageMembers = isSuperAdmin || isAdmin || isLeader;

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-3 p-3 px-4 cursor-pointer hover:bg-white/[0.02] transition"
        onClick={onToggle}>
        {expanded
          ? <ChevronDown className="h-5 w-5 shrink-0" style={{ color: '#a78bfa' }} />
          : <ChevronRight className="h-5 w-5 shrink-0" style={{ color: '#a78bfa' }} />
        }
        <Users className="h-5 w-5 shrink-0" style={{ color: '#a78bfa' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>{cp.name}</p>
            {cp.leaderName && (
              <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded"
                style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                <Crown className="h-3.5 w-3.5" /> {cp.leaderName}
              </span>
            )}
          </div>
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {cp.memberCount} miembro(s)
            {cp.pendingCount > 0 && <span style={{ color: '#fbbf24' }}> · {cp.pendingCount} pendiente(s)</span>}
          </p>
        </div>
        {isSuperAdmin && (
          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
            <button onClick={onEdit} className="p-2 rounded-lg hover:bg-white/5 transition"
              style={{ color: '#a78bfa' }} title="Editar CP">
              <Pencil className="h-5 w-5" />
            </button>
            <button onClick={onDelete} className="p-2 rounded-lg hover:bg-white/5 transition"
              style={{ color: '#ef4444' }} title="Eliminar CP">
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {/* Members list */}
      {expanded && (
        <div className="px-4 pb-3" style={{ paddingLeft: '3.25rem' }}>
          {membersQ.isLoading && (
            <p className="text-xs py-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Cargando miembros...</p>
          )}
          {!membersQ.isLoading && members.length === 0 && (
            <p className="text-xs py-2" style={{ color: 'rgba(255,255,255,0.3)' }}>No hay miembros</p>
          )}
          <div>
            {members.map((m: any, idx: number) => (
              <MemberRow
                key={m.id}
                member={m}
                isFirst={idx === 0}
                canManageMembers={canManageMembers}
                canManageAlts={isSuperAdmin || isAdmin}
                onSetMemberStatus={onSetMemberStatus}
                currentUserId={currentUserId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Individual Member Row (expandable with secondary chars) ----------

function MemberRow({
  member: m, isFirst, canManageMembers, onSetMemberStatus, currentUserId, canManageAlts,
}: {
  member: any;
  isFirst: boolean;
  canManageMembers: boolean;
  onSetMemberStatus: (userId: number, memberName: string, status: 'confirmed' | 'removed') => void;
  currentUserId: number;
  canManageAlts: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isOwnRow = Number(m.id) === currentUserId;
  const canEditAlts = isOwnRow || canManageAlts;
  const secondaryChars = (m.secondaryCharacters || []) as any[];
  const utils = trpc.useUtils();

  // Add secondary character mutation
  const addSecChar = trpc.raid.commandParties.addSecondaryChar.useMutation({
    onSuccess: () => {
      utils.raid.commandParties.invalidate();
      toast.success('PJ secundario agregado');
    },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteSecChar = trpc.raid.commandParties.deleteSecondaryChar.useMutation({
    onSuccess: () => {
      utils.raid.commandParties.invalidate();
      toast.success('PJ secundario eliminado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Classes for dropdown
  const classesQ = trpc.raid.commandParties.listClasses.useQuery(undefined, { enabled: expanded && canEditAlts });
  const classes = (classesQ.data || []) as any[];
  const [newSecName, setNewSecName] = useState('');
  const [newSecClass, setNewSecClass] = useState('');

  const handleAddSec = () => {
    if (!newSecName.trim()) return;
    const payload: any = { name: newSecName.trim(), className: newSecClass || undefined };
    if (!isOwnRow) payload.userId = Number(m.id);
    addSecChar.mutate(payload);
    setNewSecName('');
    setNewSecClass('');
  };

  return (
    <div>
      {/* Separator line between members */}
      {!isFirst && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '0 -0.5rem' }} />
      )}

      {/* Main member row */}
      <div
        className="flex items-center justify-between py-2.5 px-1 cursor-pointer hover:bg-white/[0.02] rounded transition"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Expand indicator */}
          {(secondaryChars.length > 0 || canEditAlts) ? (
            expanded
              ? <ChevronDown className="h-4 w-4 shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
              : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }} />
          ) : (
            <div className="w-4" />
          )}

          {/* Avatar */}
          <div className="flex h-7 w-7 items-center justify-center rounded-full text-white text-[10px] font-bold shrink-0"
            style={{ background: m.isLeader ? 'rgba(251,191,36,0.25)' : 'rgba(167,139,250,0.2)' }}>
            {(m.characterName || m.name || '?').slice(0, 1).toUpperCase()}
          </div>

          {/* Name + class badge */}
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>
              {m.characterName || m.name}
            </span>
            {m.classMain && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}>
                {m.classMain}
              </span>
            )}
            {m.isLeader && (
              <Crown className="h-4 w-4 shrink-0" style={{ color: '#fbbf24' }} />
            )}
            {m.cpStatus === 'pending' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                PENDIENTE
              </span>
            )}
            {m.cpStatus === 'confirmed' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                CONFIRMADO
              </span>
            )}
            {secondaryChars.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>
                +{secondaryChars.length} alt{secondaryChars.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {canManageMembers && !m.isLeader && (
          <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            {m.cpStatus === 'pending' && (
              <button onClick={() => onSetMemberStatus(m.id, m.characterName || m.name, 'confirmed')}
                className="p-1.5 rounded hover:bg-white/5 transition" title="Confirmar"
                style={{ color: '#22c55e' }}>
                <UserCheck className="h-5 w-5" />
              </button>
            )}
            <button onClick={() => onSetMemberStatus(m.id, m.characterName || m.name, 'removed')}
              className="p-1.5 rounded hover:bg-white/5 transition" title="Sacar de CP"
              style={{ color: '#ef4444' }}>
              <UserX className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {/* Expanded: Secondary characters */}
      {expanded && (
        <div className="ml-12 mb-2 rounded-lg p-2.5"
          style={{ background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.1)' }}>
          {secondaryChars.length === 0 && !canEditAlts && (
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Sin personajes secundarios</p>
          )}
          {secondaryChars.map((sc: any) => (
            <div key={sc.id} className="flex items-center justify-between py-1.5"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex items-center gap-2">
                <Swords className="h-3.5 w-3.5 shrink-0" style={{ color: '#a78bfa' }} />
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>{sc.name}</span>
                {sc.className && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>
                    {sc.className}
                  </span>
                )}
              </div>
              {canEditAlts && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSecChar.mutate({ id: sc.id, userId: isOwnRow ? undefined : Number(m.id) }); }}
                  className="p-1 rounded hover:bg-white/5 transition" title="Eliminar PJ secundario"
                  style={{ color: '#ef4444' }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}

          {/* Add secondary character form (only own row) */}
          {canEditAlts && (
            <div className="flex items-center gap-2 mt-2">
              <input
                value={newSecName}
                onChange={e => setNewSecName(e.target.value)}
                placeholder="Nombre PJ secundario..."
                className="input-dark flex-1 text-xs py-1.5"
                onClick={e => e.stopPropagation()}
              />
              {classes.length > 0 && (
                <select
                  value={newSecClass}
                  onChange={e => setNewSecClass(e.target.value)}
                  className="input-dark text-xs py-1.5"
                  style={{ appearance: 'none', maxWidth: '120px' }}
                  onClick={e => e.stopPropagation()}
                >
                  <option value="">Clase...</option>
                  {classes.map((c: any) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleAddSec(); }}
                disabled={!newSecName.trim()}
                className="rounded px-2.5 py-1.5 text-xs font-medium"
                style={{
                  background: 'rgba(167,139,250,0.15)',
                  color: '#a78bfa',
                  opacity: newSecName.trim() ? 1 : 0.4,
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Simple modal overlay ----------

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {children}
    </div>
  );
}
