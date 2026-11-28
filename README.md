# Planejamento de Materiais

A plataforma registra programação mensal, entregas dos parceiros e materiais recebidos. A baixa vincula uma entrega a uma ou mais linhas da programação, com conversão por fornecedor e material. O PDF de divulgação usa as quantidades programadas e o calendário da versão selecionada.

## Demonstração local

Requer Node.js 24 e npm.

```sh
npm ci
npm run dev
```

Abra http://localhost:3000. Para usar outra porta com `npm run dev` ou `npm start`, adicione `PORT=4000` ao arquivo `.env` na raiz do projeto e reinicie o servidor. Uma variável `PORT` já definida no ambiente tem prioridade sobre o arquivo.

Sem Supabase configurado, o servidor de desenvolvimento apresenta dados ilustrativos de dezembro de 2026. A demonstração abre como administrador. Use o menu de conta para testar os níveis de acesso dos perfis da demonstração. Alterações da demonstração ficam na pasta local `.data`.

## Configuração para hospedagem

1. Crie ou abra o projeto Supabase e execute [supabase/setup.sql](supabase/setup.sql) no SQL Editor. Execute o script novamente em instalações existentes para adicionar o controle de tentativas de login.
2. Configure as variáveis de [.env.example](.env.example) na hospedagem. Use `ADMIN_EMAIL` e `ADMIN_PASSWORD` para definir a conta administradora. Gere `AUTH_SESSION_SECRET` com `openssl rand -hex 32` e mantenha o segredo e a chave de serviço exclusivamente no servidor. Defina `SITE_URL` com a origem HTTPS e `DEMO_MODE=false`.
3. Na Vercel, importe o projeto como Next.js e publique. Para reproduzir o build localmente, use `npm run build` e `npm start`.
4. Entre com a conta administradora e abra **Perfis de acesso** para cadastrar e-mails e senhas temporárias. Entregue as senhas diretamente aos titulares. Cada pessoa confirma a senha definitiva no primeiro acesso. Quando alguém perder a senha, use **Redefinir senha** no perfil para emitir outra temporária. A redefinição invalida as sessões anteriores. Para mudar a senha da conta administradora inicial, atualize `ADMIN_PASSWORD` na hospedagem e faça um novo deploy.

Para migrar quem usava o link por e-mail, emita uma senha temporária com **Redefinir senha**. O envio de e-mails pelo Supabase Auth e o callback de login foram substituídos pelo login com senha.

A base de produção começa vazia. Emissões do PDF podem usar a programação atual ou uma versão salva antes da divulgação. Consulte o histórico para identificar inclusões, alterações, cancelamentos e lançamentos.

## Níveis de acesso

| Nível | Acesso |
| --- | --- |
| Nível 4 - Administrador | Todos os recursos |
| Nível 3 - Gerenciador | Sem acesso a Perfis de acesso |
| Nível 2 - Auxiliar | Sem acesso à Administração |
| Nível 1 - Terceiro | Sem acesso ao PDF mensal |

Cada nível inferior acumula as restrições dos níveis acima. Novos perfis de terceiros consultam registros e registram entregas para as combinações de fornecedor e material autorizadas. Perfis existentes de operação aparecem no nível 1 e preservam as permissões já cadastradas.
