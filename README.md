# Planejamento de Materiais - Romagnole Produtos Elétricos

A plataforma registra programação mensal, envios dos parceiros e recebimentos da Romagnole. A baixa vincula uma entrega a uma ou mais linhas da programação, com conversão por fornecedor e material. O PDF de divulgação usa as quantidades programadas e o calendário da versão selecionada.

## Demonstração local

Requer Node.js 24 e npm.

```sh
npm ci
npm run dev
```

Abra http://localhost:3000. Sem Supabase configurado, o servidor de desenvolvimento apresenta dados ilustrativos de dezembro de 2026. O menu de conta permite visualizar como a Romagnole ou um dos parceiros. Alterações da demonstração ficam na pasta local `.data`.

## Configuração para hospedagem

1. Crie um projeto no Supabase. Execute [supabase/setup.sql](supabase/setup.sql) no SQL Editor para criar a tabela e restringir o acesso ao servidor.

2. Configure no ambiente de hospedagem as variáveis de [.env.example](.env.example). Use a URL do projeto, a chave publicável, a chave de serviço exclusivamente no servidor, os e-mails iniciais da Romagnole em `ADMIN_EMAILS` separados por vírgula, e a origem HTTPS do site em `SITE_URL`. Mantenha `DEMO_MODE=false` em produção.

3. No Supabase Auth, habilite a autenticação por e-mail, configure o SMTP de produção e defina a URL do site. Adicione `https://<domínio>/auth/callback` à lista de redirecionamentos permitidos. Com o template padrão do Supabase, o usuário deve abrir o link no navegador em que o solicitou.

4. Na Vercel, importe o repositório usando Next.js. Configure as variáveis no ambiente correspondente e publique. Para executar o build localmente, use `npm run build` e `npm start`.

5. Entre com um dos e-mails internos iniciais. Cadastre os materiais, fornecedores, conversões e perfis. Envie o endereço do site aos usuários cadastrados para que eles solicitem o link temporário no próprio e-mail.

A base de produção começa vazia. Emissões do PDF podem usar a programação atual ou uma versão salva antes da divulgação. Consulte o histórico para identificar inclusões, alterações, cancelamentos e lançamentos.
