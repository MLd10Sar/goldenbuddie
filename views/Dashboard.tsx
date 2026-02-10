
import React, { useState, useMemo, useEffect } from 'react';
import { Session, Invite, Interest, AreaId } from '../types';
import { MOCK_PEERS, AREAS } from '../constants';

interface DashboardProps {
  session: Session;
  invites: Invite[];
  remotePeers: Session[];
  onSendInvite: (toId: string, activity: Interest) => void;
  onRespond: (inviteId: string, action: 'ACCEPTED' | 'DECLINED') => void;
  onReset: () => void;
}

interface ConfirmingInvite {
  buddyId: string;
  buddyName: string;
  activity: Interest;
}

export const Dashboard: React.FC<DashboardProps> = ({ session, invites, remotePeers, onSendInvite, onRespond, onReset }) => {
  const [selectedBuddyId, setSelectedBuddyId] = useState<string | null>(null);
  const [confirmingInvite, setConfirmingInvite] = useState<ConfirmingInvite | null>(null);

  // Filter incoming invites we haven't responded to yet
  const incomingInvites = useMemo(() => {
    return invites.filter(inv => 
      inv.toSessionId === session.id && inv.status === 'PENDING'
    );
  }, [invites, session.id]);

  // Merged matching logic: Remote Peers (Real) + Mock Peers (Simulated)
  const allPeers = useMemo(() => {
    const primaryInterest = session.interests[0];
    
    // Convert Remote peers to the peer display format
    const realPeers = remotePeers.map(p => ({
      id: p.id,
      displayName: p.displayName,
      areaId: p.areaId,
      interests: p.interests,
      distance: 'Live Nearby',
      buddySince: 'Joined Today',
      lastSeen: 'Online Now',
      isReal: true
    }));

    const mockPeers = MOCK_PEERS.map(p => ({ ...p, isReal: false }));
    const combined = [...realPeers, ...mockPeers];

    return combined.map(peer => {
      let score = 0;
      if (peer.areaId === session.areaId) score += 40;
      const peerInterests = peer.interests as Interest[];
      const hasPrimaryMatch = peerInterests.includes(primaryInterest);
      if (hasPrimaryMatch) {
        score += 60;
        if (peerInterests[0] === primaryInterest) score += 15;
      }
      const otherSharedInterests = session.interests.slice(1).filter(i => 
        peerInterests.includes(i) && i !== primaryInterest
      );
      score += (otherSharedInterests.length * 20);
      const matchPercentage = Math.min(Math.round((score / 120) * 100), 100);

      return { 
        ...peer, 
        score, 
        matchPercentage,
        isPrimaryMatch: hasPrimaryMatch 
      };
    }).sort((a, b) => b.score - a.score);
  }, [session, remotePeers]);

  const activeInvite = useMemo(() => {
    return invites.find(inv => 
      inv.fromSessionId === session.id && (inv.status === 'PENDING' || inv.status === 'ACCEPTED')
    );
  }, [invites, session.id]);

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'PENDING': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'ACCEPTED': return 'bg-green-100 text-green-800 border-green-200';
      case 'DECLINED': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getPercentageColor = (percent: number) => {
    if (percent >= 80) return 'text-green-600 bg-green-50';
    if (percent >= 50) return 'text-amber-600 bg-amber-50';
    return 'text-slate-500 bg-slate-50';
  };

  const getAreaName = (id: AreaId) => AREAS.find(a => a.id === id)?.name || id;

  const handleConfirmInvite = () => {
    if (confirmingInvite) {
      onSendInvite(confirmingInvite.buddyId, confirmingInvite.activity);
      setConfirmingInvite(null);
    }
  };

  // View: Detail Mode
  if (selectedBuddyId) {
    const buddy = allPeers.find(b => b.id === selectedBuddyId);
    if (!buddy) {
      setSelectedBuddyId(null);
      return null;
    }

    const hasInvite = invites.some(inv => inv.toSessionId === buddy.id && inv.status === 'PENDING');
    const isAccepted = invites.some(inv => inv.toSessionId === buddy.id && inv.status === 'ACCEPTED');

    return (
      <div className="p-6 animate-slideIn">
        <button onClick={() => setSelectedBuddyId(null)} className="mb-6 text-slate-500 font-semibold flex items-center gap-1">
          ← Back to list
        </button>

        <div className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100 mb-8 text-center relative overflow-hidden">
          {buddy.isReal && (
            <div className="absolute top-2 left-2 bg-green-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span> LIVE
            </div>
          )}
          {buddy.isPrimaryMatch && (
            <div className="absolute top-0 right-0 bg-amber-400 text-amber-950 px-4 py-1 font-bold text-[10px] uppercase tracking-widest rounded-bl-xl">
              Primary Match
            </div>
          )}
          
          <div className="w-24 h-24 bg-amber-100 rounded-full mx-auto mb-6 flex items-center justify-center text-4xl shadow-inner">
            👤
          </div>
          <h2 className="text-3xl font-bold mb-2">{buddy.displayName}</h2>
          <div className="flex items-center justify-center gap-2 mb-4">
            <p className="text-slate-500">{buddy.distance}</p>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getPercentageColor(buddy.matchPercentage)}`}>
              {buddy.matchPercentage}% Match
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div className="text-left border-r border-slate-200 pr-2">
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tight">Buddy Since</p>
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                <span className="text-xs">📅</span> {buddy.buddySince || 'Oct 2023'}
              </p>
            </div>
            <div className="text-left pl-2">
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tight">Status</p>
              <p className={`text-sm font-semibold flex items-center gap-1 ${buddy.isReal ? 'text-green-600' : 'text-slate-700'}`}>
                <span className="text-xs">{buddy.isReal ? '🟢' : '🕒'}</span> {buddy.lastSeen}
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {buddy.interests.map(i => {
              const isPrimary = i === session.interests[0];
              const isShared = session.interests.includes(i as Interest);
              return (
                <span key={i} className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1 ${
                  isPrimary ? 'bg-amber-500 text-white' : isShared ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {isPrimary && <span>★</span>}
                  {i}
                </span>
              );
            })}
          </div>

          <div className="space-y-4">
            {buddy.interests.map(activity => (
              <button
                key={activity}
                disabled={hasInvite || !!activeInvite || isAccepted}
                onClick={() => setConfirmingInvite({ buddyId: buddy.id, buddyName: buddy.displayName, activity: activity as Interest })}
                className={`w-full py-5 rounded-2xl text-xl font-bold transition-all shadow-md flex items-center justify-center gap-2 ${
                  hasInvite 
                    ? 'bg-slate-100 text-slate-400 border-2 border-slate-200' 
                    : isAccepted
                    ? 'bg-green-100 text-green-700 border-2 border-green-200'
                    : !!activeInvite
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : activity === session.interests[0] 
                      ? 'bg-amber-500 hover:bg-amber-600 text-amber-950 active:scale-95 ring-4 ring-amber-100'
                      : 'bg-white border-2 border-amber-200 text-amber-900 hover:bg-amber-50 active:scale-95'
                }`}
              >
                {hasInvite ? (
                  <>
                    <span className="text-2xl animate-spin-slow">⏳</span> Invite Sent
                  </>
                ) : isAccepted ? (
                  <>
                    <span className="text-2xl">✅</span> Walk Confirmed
                  </>
                ) : (
                  `Invite for ${activity}`
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Confirmation Modal */}
        {confirmingInvite && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fadeIn">
            <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-scaleUp">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-amber-100 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl">
                  🤝
                </div>
                <h3 className="text-2xl font-bold text-slate-800">Send Invite?</h3>
                <p className="text-slate-600 mt-2">
                  Send invite to <span className="font-bold text-slate-800">{confirmingInvite.buddyName}</span>?
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleConfirmInvite}
                  className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold rounded-2xl text-lg"
                >
                  Yes, Send Invite
                </button>
                <button
                  onClick={() => setConfirmingInvite(null)}
                  className="w-full py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl text-lg"
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // View: Main List Mode
  return (
    <div className="flex flex-col h-full relative">
      {/* Top Banner for Active Outgoing Invite */}
      {activeInvite && (
        <div className={`p-4 border-b flex items-center justify-between sticky top-0 z-10 shadow-sm ${getStatusColor(activeInvite.status)}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{activeInvite.status === 'ACCEPTED' ? '✅' : '⏳'}</span>
            <div>
              <p className="font-bold text-sm">
                Invite {activeInvite.status === 'ACCEPTED' ? 'Confirmed!' : 'is Waiting...'}
              </p>
              <p className="text-xs opacity-80">
                {activeInvite.activity} with {allPeers.find(p => p.id === activeInvite.toSessionId)?.displayName || 'Buddy'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Buddy List */}
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-bold">Find a Buddy</h2>
            <p className="text-slate-500 text-sm">Matching in {getAreaName(session.areaId)}</p>
          </div>
          <button onClick={onReset} className="text-xs text-slate-400 underline">Reset Settings</button>
        </div>

        {/* Real Peers Section if any exist */}
        {remotePeers.length > 0 && (
          <div className="bg-green-50/50 p-4 rounded-3xl border border-green-100 mb-6">
            <h3 className="text-xs font-bold text-green-700 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping"></span>
              Live Buddies Online
            </h3>
            <div className="space-y-4">
              {allPeers.filter(p => p.isReal).map(buddy => {
                const invite = invites.find(inv => inv.toSessionId === buddy.id && (inv.status === 'PENDING' || inv.status === 'ACCEPTED'));
                return (
                  <button
                    key={buddy.id}
                    onClick={() => setSelectedBuddyId(buddy.id)}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                      invite?.status === 'ACCEPTED' ? 'bg-green-100 border-green-300' : 'bg-white border-green-200'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center text-xl shadow-inner shrink-0">
                        {buddy.displayName[0]}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <h4 className="font-bold">{buddy.displayName}</h4>
                          <span className="text-[10px] text-green-600 font-bold px-1.5 py-0.5 bg-green-50 rounded uppercase">Live</span>
                        </div>
                        <p className="text-xs text-slate-500">Shared: {buddy.interests.filter(i => session.interests.includes(i as Interest)).join(', ')}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Suggested Buddies</h3>
          {allPeers.filter(p => !p.isReal).map((buddy) => {
            const inviteForBuddy = invites.find(inv => inv.toSessionId === buddy.id && (inv.status === 'PENDING' || inv.status === 'ACCEPTED'));
            const isPending = inviteForBuddy?.status === 'PENDING';
            const isConfirmed = inviteForBuddy?.status === 'ACCEPTED';

            return (
              <button
                key={buddy.id}
                onClick={() => setSelectedBuddyId(buddy.id)}
                className={`w-full text-left p-5 rounded-3xl border transition-all relative overflow-hidden group shadow-sm active:scale-95 ${
                  isConfirmed 
                    ? 'bg-green-50 border-green-200 shadow-sm' 
                    : isPending
                    ? 'bg-slate-100 border-slate-300 grayscale-[0.4] cursor-default'
                    : buddy.isPrimaryMatch 
                    ? 'bg-white border-amber-300 ring-2 ring-amber-50' 
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center gap-4 mb-3">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-inner shrink-0 ${
                    isConfirmed ? 'bg-green-100' : isPending ? 'bg-slate-200' : buddy.isPrimaryMatch ? 'bg-amber-100' : 'bg-slate-50'
                  }`}>
                    {isConfirmed ? '🤝' : isPending ? '⏳' : buddy.displayName[0]}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-xl">{buddy.displayName}</h3>
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${getPercentageColor(buddy.matchPercentage)}`}>
                        {buddy.matchPercentage}% match
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">{buddy.distance}</p>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-1.5 mb-4 opacity-70">
                  {buddy.interests.map(i => (
                    <span key={i} className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      session.interests.includes(i as Interest) ? 'bg-amber-100 text-amber-700' : 'bg-slate-50 text-slate-400'
                    }`}>
                      {i}
                    </span>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                  <span className="text-sm font-bold text-slate-400 group-hover:text-amber-600 transition-colors">
                    {isPending ? 'Invite Pending' : isConfirmed ? 'Walk Confirmed' : 'Tap to Invite'}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">View Details →</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Incoming Invite Modal (Polled from Relay) */}
      {incomingInvites.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl animate-bounceIn text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-400 via-amber-200 to-amber-400"></div>
            <div className="text-5xl mb-6">👋</div>
            <h3 className="text-3xl font-black text-slate-800 mb-2">New Invite!</h3>
            <p className="text-slate-600 mb-8 text-lg">
              <span className="font-bold text-slate-800">
                {allPeers.find(p => p.id === incomingInvites[0].fromSessionId)?.displayName || 'A Buddy'}
              </span> wants to go for a <span className="text-amber-600 font-bold">{incomingInvites[0].activity}</span>.
            </p>
            
            <div className="flex flex-col gap-4">
              <button
                onClick={() => onRespond(incomingInvites[0].id, 'ACCEPTED')}
                className="w-full py-5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-2xl text-xl shadow-lg active:scale-95 transition-transform"
              >
                Accept & Meet Up
              </button>
              <button
                onClick={() => onRespond(incomingInvites[0].id, 'DECLINED')}
                className="w-full py-4 bg-slate-100 text-slate-500 font-bold rounded-2xl text-lg hover:bg-slate-200 active:scale-95 transition-transform"
              >
                Not Today
              </button>
            </div>
            <p className="mt-6 text-xs text-slate-400 italic">This invite expires in 1 hour.</p>
          </div>
        </div>
      )}
    </div>
  );
};
