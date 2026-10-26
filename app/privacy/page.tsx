import Link from 'next/link';

export const metadata = { title: 'Privacy – Tokken' };

export default function Privacy() {
  return (
    <main className="shell">
      <header className="top"><Link href="/" className="logo">Tokken</Link></header>
      <article className="panel prose">
        <h1 className="h-hand">Privacy</h1>
        <p>Tokken is een hobbyproject om het kaartspel met knikkers online met vrienden te spelen.</p>
        <h2>Wat we bijhouden</h2>
        <ul>
          <li>Als je aanmeldt met Google: je naam, e-mailadres en profielfoto-link, enkel om je te herkennen in het spel.</li>
          <li>Wat er in het spel gebeurt: welke kamers er gemaakt worden, wie meedoet, wie wint, en oefenspellen. Zo zien we of het spel goed werkt.</li>
          <li>Chatberichten in een kamer, zodat iedereen in die kamer ze kan lezen.</li>
          <li>Anonieme bezoekersstatistieken (Vercel Analytics), zonder cookies.</li>
        </ul>
        <h2>Wat we niet doen</h2>
        <ul>
          <li>We verkopen of delen je gegevens met niemand.</li>
          <li>We sturen geen reclame of nieuwsbrieven.</li>
        </ul>
        <h2>Verwijderen</h2>
        <p>Wil je dat je gegevens verwijderd worden? Mail naar rob.derop@gmail.com.</p>
      </article>
    </main>
  );
}
