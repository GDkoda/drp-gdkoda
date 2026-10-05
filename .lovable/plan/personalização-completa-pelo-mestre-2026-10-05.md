# Personalização completa pelo Mestre

## Objetivo
Dar à conta do Mestre uma área única para personalizar o conteúdo e a aparência do aplicativo sem alterar código, com aplicação imediata para todos os jogadores.

## O que será construído
- Nova aba **Aparência e textos** no Painel do Mestre.
- Editor organizado por tela para os principais títulos, nomes das abas, botões e textos de apoio da Taverna, Fichas, Jogos, Loja, Baú e painel do Mestre.
- Controles visuais para cores principais, cor do texto, tamanho geral dos textos, tamanho dos títulos e escala dos itens da tela.
- Escolha de imagem de fundo por envio de arquivo, com opções de intensidade e encaixe.
- Pré-visualização ao vivo antes de salvar, botão para restaurar o padrão e confirmação ao publicar as mudanças.
- Configuração salva no backend e aplicada automaticamente para todas as contas.

## Segurança e comportamento
- Todos podem ler a personalização ativa para que a interface carregue corretamente.
- Somente a conta com papel de Mestre pode alterar as configurações ou enviar a imagem de fundo.
- Valores de cor, tamanho e imagem serão validados e limitados para evitar texto ilegível ou interface quebrada em celulares.
- Caso uma configuração esteja ausente ou inválida, o aplicativo usa o tema medieval atual como padrão.

## Detalhes técnicos
- Criar uma configuração global única com textos em estrutura chave/valor e opções visuais tipadas.
- Criar armazenamento próprio para a imagem de fundo, com leitura pública e gravação exclusiva do Mestre.
- Adicionar um provedor global que carrega a configuração e aplica variáveis visuais sem recarregar a página.
- Centralizar os textos editáveis em um catálogo para manter padrões, restauração e atualização das telas consistentes.
- Atualizar as páginas existentes para consumir os textos personalizados e completar os metadados próprios de cada página.
- Validar em desktop e celular, incluindo contraste, rolagem, menus e ausência de sobreposição.
