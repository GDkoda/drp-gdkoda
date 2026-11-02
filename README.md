# Drp Gdkoda

Crie um aplicativo web completo para mesa de RPG baseado no sistema 3D&T Alpha, com design responsivo (mobile-first) e tema fantasia/medieval:

1. Sistema de Contas e Autenticação (Jogador vs. Mestre):
- Conta do Jogador: carteira de moedas compartilhada na conta, baú de itens geral, sistema de vigor/energia diário (anti-farming) e suporte a múltiplas fichas por conta.
- Conta do Mestre: acesso total para visualizar e editar qualquer ficha, alterar saldo de moedas e inventário dos jogadores, criar/editar/remover itens na loja, gerenciar textos, cores e imagem de fundo do site, além de ferramenta para distribuir tesouro e XP em massa para todos os jogadores.

2. Fichas de Personagem (3D&T Alpha):
- Características: Força (F), Habilidade (H), Resistência (R), Armadura (A) e Poder de Fogo (PdF).
- Cálculos automáticos: PV (R x 5), PM (R x 5), FA (F ou PdF + H + 1d6) e FD (A + H + 1d6).
- Campos para Pontos de Personagem (PE) gastos/totais e Pontos de Experiência (XP).
- Listas expansíveis de Vantagens, Desvantagens e Perícias, cada uma com campo de custo de pontos individual para balanço dinâmico da pontuação da ficha.
- Bloco de anotações pessoais do jogador.
- Opção para exportar/imprimir a ficha formatada (PDF ou imagem).
- Layout mobile-friendly: cabeçalho com PV/PM/combate fixo, grade compacta de atributos e abas para inventário, vantagens e anotações.

3. Economia, Mini-jogos e Anti-Farming:
- Moedas e Vigor vinculados à conta do jogador (não à ficha).
- Limite diário de Vigor/Energia para jogar mini-jogos.
- Check-in diário com cooldown de 24 horas e recompensas progressivas.
- Missões diárias limitadas.
- Mini-jogos em rotação: combate rápido por turnos (usando atributos da ficha ativa e rolagens 1d6), jogo de dados na taverna e puzzles de lógica.

4. Loja de Itens e Transferências:
- Loja de equipamentos (armas, armaduras) e consumíveis (poções de PV/PM).
- Baú da conta onde itens comprados ficam guardados e podem ser equipados em qualquer ficha.
- Sistema de transferência segura de moedas e itens entre jogadores da mesa, com registro de transações visível ao Mestre.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://drp-gdkoda.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/92f2bb0f-f586-4e59-a6fb-582e8331a11a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
