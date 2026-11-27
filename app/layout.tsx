import type { Metadata } from 'next';
import '@fontsource/russo-one/latin-400.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource-variable/montserrat/wght.css';
import './globals.css';
export const metadata: Metadata = {title:'Romagnole | Planejamento de Materiais',description:'Planejamento e acompanhamento de entregas de materiais.'};
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="pt-BR">
    <body>{children}</body>
  </html>;
}
