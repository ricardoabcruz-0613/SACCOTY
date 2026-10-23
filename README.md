# Clube SAC Coty — versão para Netlify

Esta versão substitui o servidor Windows/SQLite por Netlify Functions e PostgreSQL. O site continua com o mesmo visual, login individual, cadastro com aprovação, gestão por equipes, catálogo, imagens, estrelas e pedidos.

## Antes de publicar

O pacote está preparado, mas NÃO altera automaticamente sua conta GitHub/Netlify. A configuração e a publicação na sua conta ainda precisam ser concluídas.

O Netlify Database depende da disponibilidade no seu plano e pode consumir créditos. Confira as condições em Data & Storage > Database antes de ativar. Não é necessário manter seu computador ligado depois da implantação. Referência: https://docs.netlify.com/build/data-and-storage/netlify-database/

Não coloque senhas, chave de configuração, arquivos .env ou dados de colaboradores no GitHub. Este pacote não contém credenciais de produção.

## 1. Prepare as variáveis no Netlify

Abra o projeto do site cheery-saccoty-star e procure Environment variables na configuração do projeto. Adicione variáveis de execução para Functions, no contexto Production:

| Nome | Valor |
| --- | --- |
| PUBLIC_ORIGIN | https://cheery-saccoty-star.netlify.app |
| SETUP_KEY | Uma chave privada aleatória de 32 a 256 caracteres, escolhida por você |
| ALLOWED_EMAIL_DOMAIN | Opcional: domínio corporativo autorizado, sem @. Deixe ausente até definir qual domínio usar. |

Para gerar uma chave localmente no PowerShell, você pode usar:

```powershell
[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
```

Guarde o resultado em seu gerenciador de senhas e use-o como SETUP_KEY no painel. Não envie a chave no chat e não a coloque no repositório. A senha da sua conta administrativa será escolhida posteriormente, no próprio site.

PUBLIC_ORIGIN precisa coincidir exatamente com o endereço usado, sem barra final. Se trocar o domínio depois, atualize essa variável e publique novamente. Pré-visualizações e outros domínios serão recusados enquanto não tiverem configuração e banco de homologação próprios.

## 2. Atualize o repositório GitHub

Extraia Clube-SAC-Coty-Netlify.zip. No repositório SACCOTY, coloque os arquivos extraídos preservando a estrutura de pastas. O arquivo netlify.toml e package.json devem ficar na RAIZ do repositório, não dentro de uma pasta extra.

Estrutura esperada:

```text
SACCOTY/
  netlify.toml
  package.json
  package-lock.json
  .gitignore
  README.md
  public/
    index.html
    app.js
  server/
    app.mjs
    database.mjs
  netlify/
    functions/
      api.mjs
    database/
      migrations/
        202610230001_clube.sql
  scripts/
    check.mjs
  test/
    api.test.mjs
    database.mjs
```

O GitHub permite Add file > Upload files. Arraste os arquivos e pastas extraídos e confira a estrutura antes de confirmar o commit. Não envie somente o ZIP para o repositório. Se preferir usar Git, use uma branch para revisar a mudança antes de publicar.

Os antigos index.html e app.js da raiz podem ser removidos para evitar confusão: agora ficam dentro de public. Os antigos server.cjs, iniciar.cmd, configurar.ps1 e backup.cmd pertencem à instalação Windows e não são usados aqui. O diretório publicado deve ser SOMENTE public; nunca publique a raiz do repositório como conteúdo estático.

## 3. Configure e publique no Netlify

Use a integração do Netlify com o repositório GitHub. O upload manual de uma pasta estática não faz esta implantação completa.

O netlify.toml incluído configura:

- Base directory: raiz do repositório (vazio).
- Build command: npm run build.
- Publish directory: public.
- Functions directory: netlify/functions.
- Node.js: 22.

Se houver configurações antigas diferentes no painel, alinhe-as com os valores acima. O Netlify instala as dependências do package.json e detecta @netlify/database. Segundo o fluxo atual do Netlify Database, isso permite provisionar o banco e aplicar a migração incluída em netlify/database/migrations durante o deploy. Se o painel solicitar habilitação do banco ou indicar incompatibilidade do plano, conclua essa etapa após conferir os custos e execute um novo deploy.

Não crie um redirecionamento geral de /api/* para index.html: essas rotas são atendidas pela Function api. Nenhuma credencial do banco deve ser colocada no JavaScript do navegador.

Depois do deploy, confira:

1. O log do deploy não apresenta falha de instalação ou migração.
2. A Function api aparece no projeto.
3. Data & Storage > Database mostra o banco ativo e as tabelas criadas.
4. https://cheery-saccoty-star.netlify.app/api/state retorna JSON com a mensagem Entre na sua conta e status 401 quando você está deslogado. Isso é esperado: comprova que a API está respondendo.

O runtime usa NETLIFY_DB_URL fornecida pelo Netlify Database. Não é necessário copiar essa conexão para o GitHub. DATABASE_URL só é uma alternativa para administradores que escolham outro PostgreSQL; nesse caso a migração deve ser aplicada separadamente, e essa não é a configuração descrita neste guia.

## 4. Crie seu administrador

No site, clique em Configuração inicial do administrador.

Informe a SETUP_KEY que guardou, seu nome, seu e-mail e sua senha individual (12 a 128 caracteres), com confirmação.

Essa operação só funciona enquanto o banco estiver sem usuários e exige a chave privada correta. O cadastro público de colaboradores só é liberado depois que o primeiro administrador é criado. Não há conta ou senha padrão.

Após criar sua conta, remova SETUP_KEY das variáveis do Netlify e faça um novo deploy. A conta administrativa fica no banco. Não repita a migração para criar outra conta. Use Gestão para conceder acesso administrativo a uma segunda pessoa autorizada, se necessário.

## 5. Coloque o programa em operação

1. Cadastre os produtos, fotos, custos e estoques reais em Gestão.
2. Peça que cada colaborador use Quero me cadastrar, com seu e-mail e sua própria senha.
3. Em Gestão > Contas e aprovações, confirme a identidade do solicitante e aprove a conta. A conta nasce pendente e com saldo zero; não há confirmação de e-mail automática.
4. Configure perfil e time. Gestor e colaboradores devem ter exatamente o mesmo nome de time. O gestor só pode creditar colaboradores ativos do próprio time, sem crédito para si ou outros gestores.
5. Lance estrelas com justificativa. Não há saldos fictícios.
6. Confirme um pedido de homologação; acompanhe o desconto, a reserva de estoque, a liberação de retirada e a entrega. Cancelamento antes da entrega devolve estrelas e estoque uma única vez.
7. Repita o acesso em outro dispositivo. Os saldos e pedidos devem ser os mesmos.

Cada usuário pode mudar a própria senha. Esquecimentos são tratados pelo administrador após confirmar a identidade, por canal privado. A redefinição encerra as sessões anteriores. Sessões duram até oito horas e usam cookies protegidos em HTTPS. Não há integração SSO ou envio de e-mail nesta versão.

Fotos de até 1 MB ficam no PostgreSQL e são carregadas por rotas autenticadas separadas; não são incluídas em massa na resposta de login/catálogo. A aplicação foi dimensionada para um time pequeno ou médio, com operações de gravação serializadas no banco. Para grandes volumes, será necessário medir carga, paginar históricos e evoluir a gestão de imagens.

Há limites persistentes de tentativas de acesso e cadastro, inclusive por IP. Em uma rede corporativa, várias pessoas podem compartilhar o mesmo IP. Se aparecer bloqueio por tentativas, aguarde 15 minutos antes de repetir; planeje cadastros escalonados em implantações com muitas pessoas.

## Banco, continuidade e cópias de segurança

O banco PostgreSQL fica separado das publicações do código. Uma nova publicação não deve zerar usuários nem saldos. A migração é versionada e aplicada uma vez pelo Netlify; não edite a migração já aplicada para alterar tabelas: crie uma nova migração.

Use as opções de backup e recuperação do provedor, confirme retenção e acesso no seu plano e teste a restauração antes de operar com dados reais. A tabela audit registra eventos administrativos sem senhas em texto simples. Não exponha o banco ou seus backups no GitHub.

Não transfira dados reais da demonstração local: os dados do protótipo eram fictícios. Se você já começou a usar a instalação Windows com pessoas reais, interrompa esta implantação e planeje a migração dos dados antes de iniciar um banco vazio.

## Diagnóstico

- Unexpected token '<': confira se o deploy publicou a Function api e manteve a estrutura correta. A nova interface mostra uma mensagem compreensível quando recebe HTML no lugar de JSON.
- Banco indisponível ou migração pendente: confira a ativação de Database e o log do deploy. A aplicação não cria tabelas a cada acesso.
- Endereço de acesso não autorizado: confira PUBLIC_ORIGIN e o endereço usado no navegador.
- Chave incorreta: confira SETUP_KEY no painel e faça novo deploy após ajustar variáveis. A chave não é a senha de login.
- Cadastro pendente: o administrador precisa aprovar a conta.
- Gestor sem colaboradores: atribua o mesmo time às contas.
- Deploy não instalou Functions: use o deploy conectado ao GitHub e confira netlify.toml; não publique apenas public por arrastar/soltar.

## Testes e limites da verificação

Para executar os testes isolados: npm ci e npm test. Para verificar os arquivos: npm run build. Os testes usam PostgreSQL embutido PGlite, sem conexão com o banco real do site. A função também foi empacotada localmente com esbuild.

Validados: chave de configuração, criação única de administrador, cadastro pendente, aprovação, login, controle de funções/equipes, sessão, proteção de origem e CSRF, preços, saldo insuficiente com rollback, disputa de estoque em requisições concorrentes no ambiente de teste, repetição de pedidos/créditos, estorno único, imagem autenticada e conservação dos dados entre instâncias do handler. A interface foi exercitada no navegador com contas fictícias locais.

A ativação do banco real, o deploy na sua conta Netlify e a concorrência entre instâncias reais ainda exigem homologação após a publicação. Não há acesso autenticado às suas contas externas nesta conversa para realizar essas etapas automaticamente.

Referências: https://docs.netlify.com/build/functions/api/ ; https://docs.netlify.com/build/data-and-storage/netlify-database/getting-started/ ; https://docs.netlify.com/build/data-and-storage/netlify-database/tooling/ ; https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/
