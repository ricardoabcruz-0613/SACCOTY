# Clube SAC Coty — aplicação para instalação interna

Este pacote contém a aplicação com banco central SQLite, contas individuais e aprovação de cadastros. Não é hospedagem: ele precisa ser executado em um computador dedicado ou servidor da empresa. O computador precisa permanecer ligado e acessível durante o uso.

## OneDrive e acesso da equipe

Sua pasta OneDrive pode guardar este pacote e um atalho para o endereço do sistema. Abrir o HTML pelo OneDrive não executa esta aplicação. O banco em uso não deve ficar no OneDrive nem em um compartilhamento de rede.

Por padrão, os dados são gravados em `%LOCALAPPDATA%\ClubeSACCoty\data` da conta Windows que executa o serviço. A TI pode definir `DATA_DIR` para outra pasta LOCAL protegida. Mantenha a mesma conta e a mesma pasta ao reiniciar ou atualizar. Não sincronize o banco ativo. Somente backups concluídos podem ser copiados para OneDrive, conforme política da empresa.

## Preparação inicial no Windows

1. Solicite à TI um computador ou servidor, Node.js 24.19 ou superior compatível com `node:sqlite`, endereço interno e certificado HTTPS confiável pelos computadores do time.
2. Extraia o pacote para uma pasta local, por exemplo `C:\Aplicacoes\Clube-SAC-Coty`. Não é necessário executar npm install: não há dependências externas.
3. Execute `configurar.ps1` pelo PowerShell conforme a política de execução da empresa. Informe seu nome, e-mail e uma senha de 12 a 128 caracteres. A senha é solicitada sem aparecer na tela. Não existe senha padrão.
4. Execute `iniciar.cmd` para avaliação LOCAL e abra http://localhost:8787 no mesmo computador. Este modo não permite acesso externo.
5. Entre com sua conta administrativa. O catálogo começa vazio e todos os saldos começam em zero. Cadastre os produtos reais, os valores e os estoques em Gestão.

## Disponibilização na rede — para a TI

Configure estas variáveis de ambiente na conta do serviço (exemplo; ajuste os caminhos reais):

```powershell
$env:HOST = '0.0.0.0'
$env:PORT = '8787'
$env:PUBLIC_ORIGIN = 'https://clube-sac-coty.interno:8787'
$env:TLS_CERT = 'C:\Certificados\clube-sac-coty-cert.pem'
$env:TLS_KEY = 'C:\Certificados\clube-sac-coty-key.pem'
$env:DATA_DIR = 'C:\Dados\ClubeSACCoty'
node server.cjs
```

Inicialize a conta administrativa usando a MESMA configuração de DATA_DIR antes de iniciar. Use certificado emitido pela infraestrutura corporativa, com cadeia completa e nome correto; proteja a chave privada com permissões da conta do serviço. Não distribua chaves no OneDrive. A aplicação bloqueia acesso em rede sem TLS. Alternativamente, a TI pode usar um proxy HTTPS e manter a aplicação em 127.0.0.1, definindo PUBLIC_ORIGIN como o endereço HTTPS final e preservando o cabeçalho Host. O cookie de sessão será Secure quando o endereço público for HTTPS.

Configure DNS, firewall para a rede autorizada, inicialização automática como serviço com conta restrita, monitoramento e cópias de segurança. Não executar como administrador do Windows. O processo manual iniciado por iniciar.cmd encerra quando a janela é fechada; ele não instala um serviço automático.

Depois de confirmar o endereço com a TI, crie um atalho da Internet na pasta OneDrive compartilhada apontando para esse endereço. O time deverá acessar o endereço, e não o arquivo index.html.

## Operação do programa

- Colaborador solicita cadastro com nome, e-mail e senha. A conta fica pendente, com zero estrelas, sem acesso até aprovação.
- Administrador acessa Gestão > Contas e aprova a conta, define perfil e time. Verifique a identidade e o e-mail corporativo antes de aprovar. Não há verificação de e-mail automática.
- Para gestores, use exatamente o mesmo nome de time dos colaboradores sob sua responsabilidade. Gestores não podem creditar para si, outros gestores, administradores ou outros times.
- Administrador cadastra recompensas com imagem PNG/JPG/WebP até 1 MB, estoque e preço inteiro em estrelas. Estoque zero mantém o produto como esgotado.
- Gestor ou administrador credita estrelas com justificativa. O histórico registra responsável, data e quantidade. Não há edição direta de saldo nem saldo fictício.
- Ao confirmar um pedido, o servidor valida os preços, o saldo e o estoque, reserva os produtos e debita estrelas na mesma transação. Pedidos repetidos com o mesmo identificador não debitam novamente.
- Administrador libera retirada e registra entrega. Cancelamento antes da entrega devolve estoque e estrelas uma única vez. Pedidos entregues são finais.
- Cada conta pode alterar sua senha em Minha senha. Em caso de esquecimento, o administrador redefine a senha após confirmar a identidade por canal privado; o colaborador deve alterar essa senha ao entrar. Sessões anteriores são encerradas. Não há envio de e-mails nem integração SSO nesta versão.
- Administrador pode bloquear contas e mudar equipes. O próprio perfil administrativo não pode ser alterado pela mesma conta. Mantenha uma segunda conta administrativa autorizada para contingência.

## Proteção, backup e restauração

Senhas são derivadas com scrypt e salt individual. Sessões duram até oito horas e usam cookies HttpOnly e SameSite; em HTTPS, Secure. Há validação de origem, token contra requisições indevidas, limite persistente de tentativas e controle de permissão no servidor. O banco também registra eventos de administração e pedidos na tabela audit. O histórico de estrelas é visível em Gestão; a auditoria técnica deve ser consultada pela TI no banco.

Execute `backup.cmd` com o mesmo DATA_DIR/conta do serviço. Ele usa o backup consistente do SQLite e cria um arquivo em `DATA_DIR\backups`. Agende o comando conforme o volume de uso; mantenha cópias em local separado, com acesso restrito, e teste restauração. O backup contém dados pessoais e hashes de senhas.

Para restaurar: pare o serviço; preserve a pasta atual inteira para recuperação; coloque o arquivo de backup escolhido em uma NOVA pasta de dados com o nome clube.sqlite; configure DATA_DIR para essa pasta; inicie e valide. Não copie arquivos WAL/SHM da base antiga para a nova pasta. A restauração reverte os registros ao instante do backup.

## Validação incluída

Execute `node --test test.cjs`. O teste utiliza banco temporário isolado e verifica cadastro pendente, aprovação, perfis, isolamento de equipes, crédito sem duplicidade, estoque concorrente, preços alterados, saldo insuficiente sem alterações parciais, cancelamento com estorno único, sessão e persistência. Requer conexões locais permitidas na porta 18787. Não usa nem altera o banco da operação.

Antes do lançamento, valide com a TI o HTTPS e o acesso de dois computadores; realize um pedido de homologação, confirme os perfis e teste backup/restauração no ambiente escolhido. A validação de regras foi executada; o ambiente corporativo e a aparência no navegador ainda precisam de homologação.

Referências técnicas: https://nodejs.org/api/sqlite.html e https://nodejs.org/api/crypto.html
