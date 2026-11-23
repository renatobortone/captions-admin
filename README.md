# Captions Admin — fluxo de assinatura e licenças

Especificação funcional inicial para o portal de clientes e administração de assinaturas do Captions. O portal é um cliente web; a API `captions-api` é a autoridade para conta, entitlement, assentos e ativações. O portal não acessa D1, o provedor de pagamentos nem credenciais privilegiadas diretamente.

## Produto comercial

- Plano recorrente mensal: **R$ 39,90 por assento/máquina por mês** no preço inicial.
- Um assento pago permite uma instalação ativa do Captions por vez.
- O número de assentos contratados é a quantidade máxima de Macs ativos ao mesmo tempo. A mesma conta pode entrar em mais Macs, mas a API só autoriza até a quantidade de assentos pagos e válidos.
- Um preço novo (por exemplo, R$ 49,90) é uma nova versão do preço. Regra inicial recomendada: manter o preço vigente dos assinantes existentes e cobrar o novo valor apenas em novas assinaturas/assentos, salvo comunicação e alteração contratual explícitas.
- Preço, moeda, versão do preço e quantidade contratada são dados do servidor/provedor de pagamento; nunca confiar em preço ou quantidade enviados pelo browser.

### Assento não é ativação

- **Cancelar/remover um assento da assinatura** altera quanto será cobrado. Por padrão, redução de quantidade fica agendada para o próximo vencimento e não gera reembolso automático do período atual.
- **Desativar um Mac** revoga apenas a ativação e libera aquele assento para outro Mac. Não reduz a quantidade da assinatura nem altera a cobrança.
- **Adicionar um assento** inicia cobrança recorrente adicional. Recomenda-se aplicar imediatamente após confirmação do pagamento, com pró-rata do ciclo restante definido pelo gateway.

## Perfis e áreas

### Cliente autenticado

- Vê plano, preço contratado, quantidade de assentos, situação da cobrança, próxima data de renovação e Macs ativos.
- Compra assento adicional via checkout hospedado pelo provedor de pagamento.
- Abre o portal hospedado de cobrança para atualizar meio de pagamento, baixar faturas ou cancelar assinatura.
- Revoga um Mac remotamente e ativa outro em seu lugar.
- Pode solicitar redução/cancelamento, com data efetiva claramente exibida.

### Administrador interno

- Acesso separado por role validada no backend (RBAC), MFA e auditoria; nunca por token global embutido no React.
- Pesquisa cliente por ID/e-mail, consulta estado comercial e técnico e vê histórico de eventos.
- Pode conceder assentos promocionais/compensatórios com justificativa, quantidade, expiração e autor. Não altera o espelho da assinatura do gateway manualmente.
- Pode suspender/restaurar conta ou revogar ativações em suporte, sempre com motivo e registro de auditoria.
- Reembolsos, cobrança, troca de cartão e cancelamento comercial continuam no gateway; a API aplica o resultado via webhooks.

## Jornada do cliente

1. Cadastro/login por e-mail e senha no portal; confirmar e-mail antes de reivindicar ou ativar licenças. O provedor de identidade (proposta: Supabase Auth) é chamado através do fluxo de autenticação definido pela API; o frontend nunca recebe segredo administrativo ou `service_role`.
2. Cliente escolhe a quantidade de assentos e segue para checkout hospedado. Cartão e dados sensíveis de pagamento não passam pelo React nem pelo Worker.
3. O gateway confirma o checkout por webhook assinado. Só depois de confirmação a API cria/atualiza a assinatura e disponibiliza os assentos pagos. A página de retorno do checkout não concede entitlement por si só.
4. Cliente instala o app em um Mac, entra com a conta e solicita ativação. A API atribui atomicamente um assento livre a essa instalação. A resposta inclui autorização assinada curta, vinculada ao ID do assento/ativação e ao UUID aleatório do Mac.
5. Em outro Mac, o login é aceito, mas a ativação retorna `no_seats_available` se todos os assentos pagos/compensatórios já estiverem ocupados. O portal oferece adicionar um assento ou revogar uma ativação existente.
6. Ao abrir e periodicamente online, o app renova a autorização. Se o assento foi revogado, a assinatura venceu/cancelou ou não está em período de tolerância, a API nega a renovação; o app bloqueia novas transcrições e volta ao estado de login/ativação. O histórico e configurações locais permanecem acessíveis.
7. O cliente pode revogar a máquina no portal. A vaga fica disponível imediatamente para nova ativação, sem reduzir a quantidade faturada.

## Estados de assinatura e acesso

- `pending`: checkout iniciado, sem acesso.
- `active`: pagamentos em dia; quantidade de assentos habilitada.
- `past_due`: pagamento falhou; período de recuperação proposto de 7 dias. Durante a tolerância, manter os assentos e avisar o cliente; não permitir expandir/comprar sem regularizar.
- `suspended`: tolerância terminou; não emitir/renovar entitlements. Dados e ativações históricas ficam preservados.
- `cancel_at_period_end`: cancelamento marcado; acesso mantido até `current_period_end`, sem nova cobrança/expansão após a solicitação.
- `canceled`/`expired`: acesso encerrado no fim do período pago; ativações param de renovar.
- `refunded`/`chargeback`: suspender conforme evento confirmado e política de disputa; gerar auditoria e notificar a pessoa.

A tolerância de 7 dias, a pró-rata na compra de assentos e as regras de reembolso são defaults propostos, sujeitos à política comercial/jurídica antes do lançamento.

## Revogação e offline

A revogação é efetiva no servidor imediatamente. Um Mac online é bloqueado na próxima validação; não há comando que apague remotamente um entitlement em um Mac offline. Para limitar a janela offline, proposta: entitlement com TTL de **24 horas**, renovação no início e a cada 6 horas enquanto o app estiver ativo, tolerância offline adicional de 0 dias. Isto requer conexão diária para uso contínuo. Se a prioridade for uso prolongado offline, aumentar TTL aumenta na mesma medida a janela máxima de revogação. Esta troca precisa ser validada antes da implementação.

## Integração técnica

- React chama somente endpoints HTTPS da `captions-api`, inclusive para cadastro, login, logout, refresh de sessão, confirmação/recuperação de senha, estado da conta, checkout, assentos e ativações. O frontend não importa SDK Supabase e não recebe URL/chave Supabase.
- A API é uma fachada para Supabase Auth: encaminha operações de identidade usando credenciais configuradas somente no servidor, aplica rate limiting e trata callbacks de confirmação/recuperação. Não persiste senha. Sessão do browser usa cookie `HttpOnly; Secure; SameSite` e proteção CSRF/origin; app nativo recebe/renova tokens através da API e guarda-os no Keychain.
- A API é a autoridade de autorização. Validação de identidade, role, titularidade, assentos e pagamentos ocorre no servidor. Avaliar validação JWT via JWKS/cache, em vez de chamar Supabase remotamente a cada endpoint, para reduzir latência e custo do Worker.
- O app macOS usa as APIs da mesma `captions-api`; segredo de assinatura nunca sai do servidor. Refresh token do app fica no Keychain e senha não é persistida.
- O provedor de pagamento ainda será escolhido. Encapsular integrações em adapter e manter IDs/eventos externos no servidor. Preferir checkout e portal de pagamento hospedados.
- Nunca armazenar PAN/CVV. Guardar somente identificadores de cliente/assinatura/price do gateway, situação, quantidade, valor/moeda contratados e períodos.
- Processar webhooks de forma idempotente, verificando assinatura, timestamp e ID do evento. Usar o gateway como fonte de verdade de cobrança e a API/D1 como projeção para autorização.

Ver contrato de dados e endpoints em `../captions-api/BILLING_FLOW.md`.

---

## Aplicação web (fundação de autenticação)

Este repositório inclui uma interface React/Vite responsiva para entrar, criar conta, confirmar e-mail e recuperar senha. Usuários comuns acessam o portal da conta, que mostra ativações e permite iniciar checkout Stripe hospedado, consultar assinatura e abrir Billing Portal. A confirmação de pagamento e a concessão de assentos são determinadas exclusivamente pelo webhook verificado na API; parâmetros de retorno no browser não ativam licenças. Usuários com role `admin` fornecida pelo backend continuam no painel global de licenças, que permite criar/listar licenças legadas e listar/revogar ativações via `/v1/portal/licenses` e `/v1/portal/activations`. A chave legada é exibida uma única vez.

### Requisitos

- Node.js 18+ e npm.
- URL pública HTTPS da API `captions-api`, configurada em `VITE_CAPTIONS_API_URL`. É a URL da API, **nunca** uma URL/chave do Supabase. Em produção, hospede o Admin e a API sob o mesmo site registrável (por exemplo, `admin.exemplo.com` e `api.exemplo.com`) ou faça proxy da API no mesmo domínio: navegadores podem bloquear cookies de sessão de terceiros mesmo com `SameSite=None`.

### Executar localmente

```sh
npm install
```

Crie `.env.local` na raiz com a URL pública da API de desenvolvimento:

```dotenv
VITE_CAPTIONS_API_URL=https://api-dev.exemplo.com
```

No build de produção, se `VITE_CAPTIONS_API_URL` não estiver definida, o Admin usa por padrão `https://captions-licensing-api.renato-3b0.workers.dev`. Para sobrescrever esse endereço no deploy, defina a variável `VITE_CAPTIONS_API_URL` no ambiente de build.

Depois inicie o servidor:

```sh
npm run dev
```

Abra o endereço exibido pelo Vite. Para gerar/verificar a versão de produção:

```sh
npm run build
npm run preview
```

Variáveis `VITE_*` são públicas e ficam embutidas no bundle; não coloque segredos nelas. `.env*`, dependências e o build de produção são ignorados pelo Git.

### Contrato de autenticação usado pelo frontend

Todas as chamadas vão exclusivamente para `VITE_CAPTIONS_API_URL`; `fetch` inclui `credentials: 'include'` para usar os cookies HttpOnly da sessão do browser. A API precisa permitir o Origin do portal e aplicar as suas proteções CSRF. O frontend não importa SDK Supabase, nem acessa Supabase diretamente.

- `POST /v1/auth/register` com `{ email, password, client: "browser" }`.
- `POST /v1/auth/login` com `{ email, password, client: "browser" }`; a API define os cookies e devolve `{ user: { id, email, emailConfirmed, role } }`.
- `POST /v1/auth/refresh` com `{ client: "browser" }` ao inicializar uma sessão sem cookies válidos.
- `POST /v1/auth/logout` com `{ client: "browser" }` para limpar a sessão.
- `GET /v1/me` para carregar o usuário autenticado.
- `/auth/callback` lê `access_token` e `refresh_token` do fragmento da URL e chama `POST /v1/auth/exchange` com `{ accessToken, refreshToken, client: "browser" }`; os tokens são trocados pela sessão cookie e removidos da barra de endereço após o processamento.

A confirmação de e-mail deve retornar à rota `/auth/callback` no domínio deste portal com o token no hash. A rota também processa links de recuperação (`/auth/callback?flow=recovery`): troca os tokens por sessão HttpOnly, remove tokens do hash e permite cadastrar uma nova senha. A tela de login permite solicitar instruções de recuperação; não há reenvio de confirmação de e-mail. Erros de solicitação aparecem no formulário; em produção, configure a API para autorizar o Origin correto do portal.
