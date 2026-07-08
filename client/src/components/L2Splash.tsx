/**
 * L2 LINEAGE II / RaptorSquad splash screen.
 * Reusable full-page loading indicator shown while data loads.
 */
export default function L2Splash() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#060910' }}>
      <div className="text-center animate-pulse">
        <div className="flex justify-center mb-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, rgba(123,241,214,0.3), rgba(232,121,249,0.2))' }}>
            <span className="text-3xl font-black" style={{ color: '#7bf1d6' }}>L2</span>
          </div>
        </div>
        <h1 className="text-4xl font-black tracking-[0.25em] mb-3" style={{ color: '#7bf1d6', letterSpacing: '0.25em' }}>
          LINEAGE II
        </h1>
        <p className="text-sm font-medium tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
          RaptorSquad
        </p>
        <div className="mt-8 flex justify-center">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'rgba(123,241,214,0.4)', borderTopColor: 'transparent' }} />
        </div>
      </div>
    </div>
  );
}
