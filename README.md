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

1. Crie ou abra o projeto Supabase e execute [supabase/setup.sql](supabase/setup.sql) no SQL Editor. Execute o script novamente em instalações existentes para adicionar o controle de tentativas de login.
2. Configure as variáveis de [.env.example](.env.example) na hospedagem. Use `ADMIN_EMAIL` e `ADMIN_PASSWORD` para definir a conta administradora. Gere `AUTH_SESSION_SECRET` com `openssl rand -hex 32` e mantenha o segredo e a chave de serviço exclusivamente no servidor. Defina `SITE_URL` com a origem HTTPS e `DEMO_MODE=false`.
3. Na Vercel, importe o projeto como Next.js e publique. Para reproduzir o build localmente, use `npm run build` e `npm start`.
4. Entre com a conta administradora e abra **Perfis de acesso** para cadastrar e-mails e senhas temporárias. Entregue as senhas diretamente aos titulares. Cada pessoa escolhe uma nova senha no primeiro acesso. Quando alguém perder a senha, use **Redefinir senha** no perfil para emitir outra temporária. A redefinição invalida as sessões anteriores. Para mudar a senha da própria conta administradora, atualize `ADMIN_PASSWORD` na hospedagem e faça um novo deploy.

Perfis existentes são preservados. Para migrar quem usava o link por e-mail, emita uma senha temporária com **Redefinir senha**. O envio de e-mails pelo Supabase Auth e o callback de login foram substituídos pelo login com senha.

A base de produção começa vazia. Emissões do PDF podem usar a programação atual ou uma versão salva antes da divulgação. Consulte o histórico para identificar inclusões, alterações, cancelamentos e lançamentos.
