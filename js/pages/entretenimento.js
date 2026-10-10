/*
  PCF - pages/entretenimento.js
  Jogos leves de autoconhecimento: Caça-Palavras, Memória e Quiz.
*/
PCF.Pages = PCF.Pages || {};

(function() {
  const H = PCF.Helpers;
  const S = PCF.Store;

  const DEFAULT_WORD_BANK = [
    { palavra: 'Gratidao', titulo: 'Gratidão', tipo: 'Virtude', descricao: 'Reconhecer o valor das pessoas, oportunidades e experiências recebidas, cultivando apreciação pela vida.' },
    { palavra: 'Criatividade', titulo: 'Criatividade', tipo: 'Virtude', descricao: 'Pensar em formas novas e produtivas de conceituar e fazer as coisas.' },
    { palavra: 'Curiosidade', titulo: 'Curiosidade', tipo: 'Virtude', descricao: 'Interessar-se pela experiência em andamento por si só.' },
    //{ palavra: 'Critico', titulo: 'Senso Crítico', tipo: 'Virtude', descricao: 'Refletir sobre as coisas e examiná-las a partir de todos os ângulos.' },
    //{ palavra: 'Aprendizado', titulo: 'Amor ao Aprendizado', tipo: 'Virtude', descricao: 'Dominar novas habilidades, tópicos e corpos de conhecimento.' },
    { palavra: 'Perspectiva', titulo: 'Perspectiva', tipo: 'Virtude', descricao: 'Ser capaz de dar conselhos sábios aos outros.' },
    { palavra: 'Coragem', titulo: 'Coragem', tipo: 'Virtude', descricao: 'Força interior para agir com consciência mesmo diante do medo, da dúvida ou da dificuldade.' },
    { palavra: 'Bravura', titulo: 'Bravura', tipo: 'Virtude', descricao: 'Não recuar diante de ameaças, dificuldades ou sofrimento.' },
    { palavra: 'Perseveranca', titulo: 'Perseverança', tipo: 'Virtude', descricao: 'Terminar o que se começou; persistir apesar dos obstáculos.' },
    { palavra: 'Integridade', titulo: 'Integridade', tipo: 'Virtude', descricao: 'Falar a verdade e apresentar-se de forma genuína.' },
    { palavra: 'Vitalidade', titulo: 'Vitalidade', tipo: 'Virtude', descricao: 'Encarar a vida com entusiasmo e energia; viver plenamente.' },
    { palavra: 'Bondade', titulo: 'Bondade', tipo: 'Virtude', descricao: 'Disposição sincera de fazer o bem, agir com cuidado e favorecer o crescimento das pessoas.' },
    { palavra: 'Benevolencia', titulo: 'Benevolência', tipo: 'Virtude', descricao: 'Atitude de querer o bem do outro, olhando suas necessidades com generosidade e boa vontade.' },
    { palavra: 'Indulgencia', titulo: 'Indulgência', tipo: 'Virtude', descricao: 'Capacidade de compreender falhas humanas com misericórdia, sem abandonar a responsabilidade e o aprendizado.' },
    { palavra: 'Tolerancia', titulo: 'Tolerância', tipo: 'Virtude', descricao: 'Respeitar diferenças, limites e ritmos sem agressividade, mantendo firmeza e abertura ao diálogo.' },
    { palavra: 'Empatia', titulo: 'Empatia', tipo: 'Virtude', descricao: 'Capacidade de perceber o outro com respeito, imaginando seus sentimentos e necessidades.' },
    { palavra: 'Paciencia', titulo: 'Paciência', tipo: 'Virtude', descricao: 'Saber esperar e perseverar sem perder o equilíbrio diante de processos, pessoas ou limites.' },
    { palavra: 'Disciplina', titulo: 'Disciplina', tipo: 'Virtude', descricao: 'Compromisso constante com pequenas ações que sustentam objetivos importantes.' },
    { palavra: 'Prudencia', titulo: 'Prudência', tipo: 'Virtude', descricao: 'Escolher com cuidado, avaliando consequências antes de agir.' },
    { palavra: 'Humildade', titulo: 'Humildade', tipo: 'Virtude', descricao: 'Reconhecer o próprio valor sem arrogância e aprender com pessoas, erros e circunstâncias.' },
    { palavra: 'Resiliencia', titulo: 'Resiliência', tipo: 'Virtude', descricao: 'Capacidade de se reorganizar depois de dificuldades, mantendo sentido e continuidade.' },
    { palavra: 'Inteligencia', titulo: 'Inteligência (Social)', tipo: 'Virtude', descricao: 'Estar ciente dos próprios sentimentos e motivações, bem como dos outros.' },
    //{ palavra: 'Equipe', titulo: 'Trabalho em Equipe', tipo: 'Virtude', descricao: 'Trabalhar bem como membro de um grupo; ser leal ao grupo.' },
    { palavra: 'Justica', titulo: 'Justiça', tipo: 'Virtude', descricao: 'Buscar equilíbrio, verdade e respeito aos direitos de cada pessoa nas escolhas e relações.' },
    //{ palavra: 'Imparcial', titulo: 'Imparcialidade', tipo: 'Virtude', descricao: 'Tratar todas as pessoas segundo noções de imparcialidade e justiça.' },
    { palavra: 'Lideranca', titulo: 'Liderança', tipo: 'Virtude', descricao: 'Estimular um grupo do qual se é membro para fazer as coisas.' },
    { palavra: 'Autocontrole', titulo: 'Autocontrole', tipo: 'Virtude', descricao: 'Regular o que se sente e faz; ser disciplinado.' },
    { palavra: 'Humor', titulo: 'Humor', tipo: 'Virtude', descricao: 'Levar sorrisos às outras pessoas; levar a vida de forma mais leve.' },
    //{ palavra: 'Espiritual', titulo: 'Espiritualidade', tipo: 'Virtude', descricao: 'Ter crenças coerentes em relação ao propósito e sentido maiores do universo.' },
    //{ palavra: 'Beleza', titulo: 'Apreciação da Beleza', tipo: 'Virtude', descricao: 'Observar e apreciar a beleza, a excelência e o desempenho habilidoso.' },
    { palavra: 'Compaixao', titulo: 'Compaixão', tipo: 'Virtude', descricao: 'Sentir e agir com empatia e altruísmo em relação ao sofrimento alheio.' },
    { palavra: 'Honestidade', titulo: 'Honestidade', tipo: 'Virtude', descricao: 'Ser fiel à verdade em palavras e ações.' },
    { palavra: 'Mansidao', titulo: 'Mansidão', tipo: 'Virtude', descricao: 'Agir com calma, domínio interior e firmeza serena, sem dureza ou agressividade.' },
    { palavra: 'Zelo', titulo: 'Zelo', tipo: 'Virtude', descricao: 'Cuidar com dedicação, atenção e responsabilidade daquilo que é bom e importante.' },
    { palavra: 'Candura', titulo: 'Candura', tipo: 'Virtude', descricao: 'Expressar pureza de intenção, simplicidade e sinceridade no trato com as pessoas.' },
    { palavra: 'Gentileza', titulo: 'Gentileza', tipo: 'Virtude', descricao: 'Tratar as pessoas com delicadeza, respeito e consideração nas pequenas atitudes.' },
    { palavra: 'Docura', titulo: 'Doçura', tipo: 'Virtude', descricao: 'Manifestar suavidade, ternura e bondade no modo de falar, agir e acolher.' },
    { palavra: 'Fortaleza', titulo: 'Fortaleza', tipo: 'Virtude', descricao: 'Sustentar o bem com coragem, constância e resistência diante das dificuldades.' },
    { palavra: 'Modestia', titulo: 'Modéstia', tipo: 'Virtude', descricao: 'Reconhecer o próprio valor sem vaidade, exibicionismo ou desejo de superioridade.' },
    { palavra: 'Respeito', titulo: 'Respeito', tipo: 'Virtude', descricao: 'Reconhecer e valorizar a dignidade de cada pessoa.' },
    { palavra: 'Solidariedade', titulo: 'Solidariedade', tipo: 'Virtude', descricao: 'Apoiar e se unir às outras pessoas nas dificuldades.' },
    { palavra: 'Fe', titulo: 'Fé', tipo: 'Virtude', descricao: 'Manter fidelidade e confiança nos valores e em Deus.' },
    { palavra: 'Serenidade', titulo: 'Serenidade', tipo: 'Sentimento', descricao: 'Estado de calma consciente que ajuda a responder melhor aos acontecimentos.' },
    { palavra: 'Esperanca', titulo: 'Esperança', tipo: 'Sentimento', descricao: 'Confiança ativa de que a vida pode melhorar quando unimos fé, atitude e paciência.' },
    { palavra: 'Alegria', titulo: 'Alegria', tipo: 'Emoção', descricao: 'Energia positiva que nasce do contato com algo significativo, belo ou satisfatório.' },
    { palavra: 'Confianca', titulo: 'Confiança', tipo: 'Sentimento', descricao: 'Sensação de segurança que fortalece escolhas, vínculos e continuidade.' },
    { palavra: 'Generosidade', titulo: 'Generosidade', tipo: 'Virtude', descricao: 'Disposição de compartilhar tempo, atenção, conhecimento ou recursos com boa vontade.' },
    { palavra: 'Perdao', titulo: 'Perdão', tipo: 'Virtude', descricao: 'Libertar-se do peso da mágoa, sem negar aprendizados ou limites saudáveis. Tem o objetivo de curar o teu ódio, a tua mágoa, o teu ressentimento que podem te distriuir mais do que o mal que lhe foi feito. É uma dádiva para quem foi ofendido.' },
    { palavra: 'Equilibrio', titulo: 'Equilíbrio', tipo: 'Virtude', descricao: 'Harmonizar razão, emoção e ação para viver com mais clareza.' },
    { palavra: 'Responsabilidade', titulo: 'Responsabilidade', tipo: 'Virtude', descricao: 'Assumir deveres, escolhas e consequências com consciência, cuidado e compromisso.' },
    { palavra: 'Amor', titulo: 'Amor', tipo: 'Sentimento', descricao: 'Força de cuidado, vínculo e responsabilidade que amplia o sentido da vida.' },
    { palavra: 'Paz', titulo: 'Paz', tipo: 'Sentimento', descricao: 'Quietude interior que nasce da coerência entre valores, escolhas e atitudes.' },
    { palavra: 'Amizade', titulo: 'Amizade', tipo: 'Sentimento', descricao: 'Vínculo de confiança, presença e cuidado recíproco que fortalece a caminhada da vida.' },
    { palavra: 'Entusiasmo', titulo: 'Entusiasmo', tipo: 'Emoção', descricao: 'Ânimo vivo para participar, criar e investir energia em algo que faz sentido.' },
    { palavra: 'Altruismo', titulo: 'Altruísmo', tipo: 'Virtude', descricao: 'Disposição para agir desinteressadamente em prol do bem-estar dos outros, priorizando o próximo.' },
    { palavra: 'Magnanimidade', titulo: 'Magnanimidade', tipo: 'Virtude', descricao: 'Grandeza de alma e nobreza de espírito que inclina a pessoa a praticar atos generosos e a superar pequenas ofensas.' },
    { palavra: 'Sinceridade', titulo: 'Sinceridade', tipo: 'Virtude', descricao: 'Capacidade de se expressar com verdade, transparência e sem fingimento nas palavras e atitudes.' },
    { palavra: 'Lealdade', titulo: 'Lealdade', tipo: 'Virtude', descricao: 'Compromisso e fidelidade constantes em relação a princípios, causas ou aos laços com outras pessoas.' },
    { palavra: 'Temperanca', titulo: 'Temperança', tipo: 'Virtude', descricao: 'Capacidade de exercer a moderação e o equilíbrio diante dos desejos, prazeres e impulsos.' },
    { palavra: 'Sabedoria', titulo: 'Sabedoria', tipo: 'Virtude', descricao: 'Aplicação do conhecimento, discernimento e experiência de vida para tomar decisões sensatas e éticas.' },
    { palavra: 'Acolhimento', titulo: 'Acolhimento', tipo: 'Virtude', descricao: 'Capacidade de receber o outro com abertura, consideração e sem julgamentos prévios.' },
    { palavra: 'Cuidado', titulo: 'Cuidado', tipo: 'Virtude', descricao: 'Atenção dedicada e permanente à preservação, integridade e bem-estar de si mesmo, do outro e do ambiente.' },
    { palavra: 'Autenticidade', titulo: 'Autenticidade', tipo: 'Virtude', descricao: 'Capacidade de viver e se expressar em alinhamento constante com a própria essência e valores profundos.' },
    { palavra: 'Gratificacao', titulo: 'Gratificação', tipo: 'Sentimento', descricao: 'Sensação interior de realização e contentamento pelo dever cumprido ou por um objetivo alcançado.' },
    { palavra: 'Encantamento', titulo: 'Encantamento', tipo: 'Sentimento', descricao: 'Estado de admiração e deslumbre diante da beleza, da novidade ou da profundidade da vida.' },
    { palavra: 'Otimismo', titulo: 'Otimismo', tipo: 'Sentimento', descricao: 'Disposição mental e emocional para focar nos aspectos favoráveis das situações e esperar bons resultados.' },
    { palavra: 'Complicidade', titulo: 'Complicidade', tipo: 'Sentimento', descricao: 'Sensação de conexão profunda, alinhamento e entendimento mútuo sem a necessidade de muitas palavras.' },
    { palavra: 'Pertencimento', titulo: 'Pertencimento', tipo: 'Sentimento', descricao: 'Sensação acolhedora de fazer parte de um grupo, comunidade ou propósito maior.' },
    { palavra: 'Ternura', titulo: 'Ternura', tipo: 'Sentimento', descricao: 'Afeto suave e delicado que se manifesta no cuidado, no carinho e na proteção com o outro.' },
    { palavra: 'Admiracao', titulo: 'Admiração', tipo: 'Sentimento', descricao: 'Sentimento de apreço e reconhecimento diante das qualidades, atitudes, capacidades ou realizações de alguém, inspirando respeito e valorização.' },
    { palavra: 'Afeto', titulo: 'Afeto', tipo: 'Sentimento', descricao: 'Sentimento de carinho e proximidade que fortalece vínculos e favorece relações de cuidado e confiança.' },
    { palavra: 'Contentamento', titulo: 'Contentamento', tipo: 'Sentimento', descricao: 'Sensação tranquila de satisfação com aquilo que se vive, possui ou alcança, sem depender da busca constante por mais.' },
    { palavra: 'Satisfacao', titulo: 'Satisfação', tipo: 'Sentimento', descricao: 'Sensação positiva experimentada quando uma necessidade, expectativa, esforço ou objetivo encontra realização.' },
    { palavra: 'Realizacao', titulo: 'Realização', tipo: 'Sentimento', descricao: 'Sensação de plenitude decorrente de reconhecer que esforços, escolhas ou capacidades produziram algo significativo.' },
    { palavra: 'Alivio', titulo: 'Alívio', tipo: 'Sentimento', descricao: 'Sensação de tranquilidade que surge quando uma preocupação, tensão, dificuldade ou ameaça diminui ou desaparece.' },
    { palavra: 'Seguranca', titulo: 'Segurança', tipo: 'Sentimento', descricao: 'Sensação de estabilidade e proteção que permite agir, relacionar-se e tomar decisões com maior tranquilidade.' },
    { palavra: 'Afeicao', titulo: 'Afeição', tipo: 'Sentimento', descricao: 'Sentimento de estima, carinho e ligação emocional que aproxima pessoas e favorece relações cuidadosas.' },
    { palavra: 'Inspiracao', titulo: 'Inspiração', tipo: 'Sentimento', descricao: 'Estado interior de entusiasmo e elevação que desperta vontade de criar, aprender, agir ou buscar algo significativo.' },
    { palavra: 'Interesse', titulo: 'Interesse', tipo: 'Emoção', descricao: 'Estado de atenção e envolvimento que desperta vontade de conhecer, compreender ou explorar algo.' },
    { palavra: 'Amabilidade', titulo: 'Amabilidade', tipo: 'Virtude', descricao: 'Disposição para tratar as pessoas de maneira cordial, respeitosa e acolhedora, contribuindo para relações harmoniosas.' },
    { palavra: 'Cortesia', titulo: 'Cortesia', tipo: 'Virtude', descricao: 'Prática de demonstrar consideração e respeito por meio de palavras, gestos e atitudes educadas.' },
    { palavra: 'Cordialidade', titulo: 'Cordialidade', tipo: 'Virtude', descricao: 'Capacidade de se relacionar com simpatia, respeito e disposição amistosa.' },
    { palavra: 'Delicadeza', titulo: 'Delicadeza', tipo: 'Virtude', descricao: 'Capacidade de agir e se comunicar com sensibilidade, atenção e respeito aos sentimentos e limites das pessoas.' },
    { palavra: 'Sensibilidade', titulo: 'Sensibilidade', tipo: 'Virtude', descricao: 'Capacidade de perceber com atenção sentimentos, necessidades, sutilezas e situações que exigem compreensão e cuidado.' },
    { palavra: 'Disponibilidade', titulo: 'Disponibilidade', tipo: 'Virtude', descricao: 'Disposição sincera para oferecer presença, atenção, tempo ou ajuda quando necessário.' },
    { palavra: 'Cooperacao', titulo: 'Cooperação', tipo: 'Virtude', descricao: 'Disposição para trabalhar e agir juntamente com outras pessoas na construção de objetivos e benefícios compartilhados.' },
    { palavra: 'Companheirismo', titulo: 'Companheirismo', tipo: 'Virtude', descricao: 'Disposição para permanecer presente, colaborar e oferecer apoio nas experiências, desafios e conquistas compartilhadas.' },
    { palavra: 'Fraternidade', titulo: 'Fraternidade', tipo: 'Virtude', descricao: 'Atitude de reconhecer o outro como semelhante, promovendo união, respeito, cuidado e ajuda mútua.' },
    { palavra: 'Hospitalidade', titulo: 'Hospitalidade', tipo: 'Virtude', descricao: 'Disposição para receber e acolher pessoas com atenção, respeito, generosidade e abertura.' },
    { palavra: 'Compreensao', titulo: 'Compreensão', tipo: 'Virtude', descricao: 'Capacidade de buscar entender sentimentos, razões, dificuldades e perspectivas antes de julgar ou reagir.' },
    { palavra: 'Escuta', titulo: 'Escuta', tipo: 'Virtude', descricao: 'Capacidade de oferecer atenção verdadeira ao que o outro comunica, procurando compreender antes de responder ou julgar.' },
    { palavra: 'Assertividade', titulo: 'Assertividade', tipo: 'Virtude', descricao: 'Capacidade de expressar pensamentos, sentimentos, necessidades e limites com clareza e respeito, sem agressividade ou submissão.' },
    { palavra: 'Discernimento', titulo: 'Discernimento', tipo: 'Virtude', descricao: 'Capacidade de analisar situações com clareza e distinguir aquilo que é adequado, verdadeiro ou necessário antes de decidir.' },
    { palavra: 'Sensatez', titulo: 'Sensatez', tipo: 'Virtude', descricao: 'Capacidade de agir com equilíbrio, bom senso e consideração pelas circunstâncias e consequências.' },
    { palavra: 'Coerencia', titulo: 'Coerência', tipo: 'Virtude', descricao: 'Capacidade de manter alinhamento entre valores, pensamentos, palavras, decisões e atitudes.' },
    { palavra: 'Constancia', titulo: 'Constância', tipo: 'Virtude', descricao: 'Capacidade de permanecer firme em valores, compromissos e boas práticas ao longo do tempo.' },
    { palavra: 'Determinacao', titulo: 'Determinação', tipo: 'Virtude', descricao: 'Disposição firme para perseguir objetivos e enfrentar dificuldades sem abandonar facilmente aquilo que possui valor.' },
    { palavra: 'Dedicacao', titulo: 'Dedicação', tipo: 'Virtude', descricao: 'Disposição para investir atenção, esforço, tempo e cuidado naquilo que se considera importante.' },
    { palavra: 'Comprometimento', titulo: 'Comprometimento', tipo: 'Virtude', descricao: 'Disposição para assumir e sustentar responsabilidades, objetivos e vínculos com seriedade e continuidade.' },
    { palavra: 'Proatividade', titulo: 'Proatividade', tipo: 'Virtude', descricao: 'Disposição para tomar iniciativa e agir antecipadamente diante de necessidades, oportunidades ou dificuldades.' },
    { palavra: 'Adaptabilidade', titulo: 'Adaptabilidade', tipo: 'Virtude', descricao: 'Capacidade de ajustar pensamentos, comportamentos e estratégias diante de mudanças sem perder os próprios valores essenciais.' },
    { palavra: 'Flexibilidade', titulo: 'Flexibilidade', tipo: 'Virtude', descricao: 'Capacidade de reconsiderar posições, adaptar-se às circunstâncias e acolher diferentes possibilidades quando necessário.' },
    { palavra: 'Autonomia', titulo: 'Autonomia', tipo: 'Virtude', descricao: 'Capacidade de tomar decisões e conduzir a própria vida com responsabilidade, consciência e respeito pelos outros.' },
    { palavra: 'Autoconfianca', titulo: 'Autoconfiança', tipo: 'Virtude', descricao: 'Capacidade de reconhecer e confiar nas próprias habilidades e possibilidades sem ignorar limites ou a necessidade de aprender.' },
    { palavra: 'Autoaceitacao', titulo: 'Autoaceitação', tipo: 'Virtude', descricao: 'Capacidade de reconhecer e acolher a própria história, qualidades e limitações, mantendo abertura para crescer e melhorar.' },
    { palavra: 'Autocompaixao', titulo: 'Autocompaixão', tipo: 'Virtude', descricao: 'Capacidade de tratar a si mesmo com compreensão e cuidado diante de erros, limitações e dificuldades, sem abandonar a responsabilidade pessoal.' },
    { palavra: 'Autoconhecimento', titulo: 'Autoconhecimento', tipo: 'Virtude', descricao: 'Capacidade de reconhecer os próprios sentimentos, pensamentos, valores, qualidades, limitações e motivações.' },
    { palavra: 'Autorrespeito', titulo: 'Autorrespeito', tipo: 'Virtude', descricao: 'Capacidade de reconhecer a própria dignidade, estabelecer limites saudáveis e agir de acordo com valores pessoais.' },
    { palavra: 'Desprendimento', titulo: 'Desprendimento', tipo: 'Virtude', descricao: 'Capacidade de não se prender excessivamente a bens, posições, resultados ou reconhecimento, sabendo compartilhar e abrir mão quando necessário.' },
    { palavra: 'Abnegacao', titulo: 'Abnegação', tipo: 'Virtude', descricao: 'Capacidade de renunciar voluntariamente a interesses pessoais quando um bem maior ou a necessidade legítima de outra pessoa assim exigir.' },
    { palavra: 'Nobreza', titulo: 'Nobreza', tipo: 'Virtude', descricao: 'Disposição para agir com dignidade, generosidade e elevação moral, inclusive diante de conflitos ou ofensas.' },
    { palavra: 'Honradez', titulo: 'Honradez', tipo: 'Virtude', descricao: 'Qualidade de agir de maneira digna, correta e fiel aos princípios éticos, mesmo quando não há reconhecimento externo.' },
    { palavra: 'Retidao', titulo: 'Retidão', tipo: 'Virtude', descricao: 'Firmeza em agir de acordo com princípios éticos e com aquilo que se reconhece como justo e correto.' },
    { palavra: 'Imparcialidade', titulo: 'Imparcialidade', tipo: 'Virtude', descricao: 'Capacidade de avaliar pessoas e situações de maneira justa, evitando favorecer interesses ou preferências pessoais indevidamente.' },
    { palavra: 'Equidade', titulo: 'Equidade', tipo: 'Virtude', descricao: 'Disposição para tratar cada pessoa de maneira justa, considerando suas circunstâncias e necessidades particulares.' },
    { palavra: 'Confiabilidade', titulo: 'Confiabilidade', tipo: 'Virtude', descricao: 'Qualidade de quem inspira confiança por agir com responsabilidade, coerência e fidelidade aos compromissos assumidos.' },
    { palavra: 'Pontualidade', titulo: 'Pontualidade', tipo: 'Virtude', descricao: 'Compromisso de respeitar horários e prazos, demonstrando consideração pelo próprio tempo e pelo tempo das outras pessoas.' },
    { palavra: 'Diligencia', titulo: 'Diligência', tipo: 'Virtude', descricao: 'Disposição para realizar deveres e tarefas com atenção, empenho, responsabilidade e cuidado.' },
    { palavra: 'Capricho', titulo: 'Capricho', tipo: 'Virtude', descricao: 'Disposição para realizar algo com atenção aos detalhes, cuidado e desejo de produzir um bom resultado.' },
    { palavra: 'Ordem', titulo: 'Ordem', tipo: 'Virtude', descricao: 'Capacidade de organizar ações, recursos, ambientes e prioridades de maneira que favoreça clareza e equilíbrio.' },
    { palavra: 'Moderacao', titulo: 'Moderação', tipo: 'Virtude', descricao: 'Capacidade de evitar excessos e buscar uma medida equilibrada nas escolhas, comportamentos e reações.' },
    { palavra: 'Sobriedade', titulo: 'Sobriedade', tipo: 'Virtude', descricao: 'Capacidade de manter equilíbrio e lucidez diante de prazeres, emoções, desejos e circunstâncias favoráveis ou adversas.' },
    { palavra: 'Cautela', titulo: 'Cautela', tipo: 'Virtude', descricao: 'Disposição para agir com atenção diante de riscos, evitando decisões precipitadas sem se deixar dominar pelo medo.' },
    { palavra: 'Persistencia', titulo: 'Persistência', tipo: 'Virtude', descricao: 'Capacidade de continuar tentando e trabalhando por algo importante mesmo quando os resultados demoram a aparecer.' },
    { palavra: 'Laboriosidade', titulo: 'Laboriosidade', tipo: 'Virtude', descricao: 'Disposição para o trabalho dedicado, produtivo e responsável, valorizando o esforço necessário para construir resultados.' },
    { palavra: 'Reconhecimento', titulo: 'Reconhecimento', tipo: 'Sentimento', descricao: 'Experiência positiva de perceber e valorizar o mérito, a contribuição, o esforço ou a importância de alguém.' },
    { palavra: 'Reverencia', titulo: 'Reverência', tipo: 'Sentimento', descricao: 'Sentimento profundo de respeito diante daquilo que se reconhece como digno, sagrado, grandioso ou especialmente valioso.' },
    { palavra: 'Conexao', titulo: 'Conexão', tipo: 'Sentimento', descricao: 'Sensação de proximidade e vínculo significativo com outra pessoa, grupo, natureza, propósito ou experiência.' },
    { palavra: 'Plenitude', titulo: 'Plenitude', tipo: 'Sentimento', descricao: 'Sensação profunda de inteireza e significado, na qual a pessoa percebe harmonia entre aquilo que vive, valoriza e realiza.' },
    { palavra: 'Tranquilidade', titulo: 'Tranquilidade', tipo: 'Sentimento', descricao: 'Sensação de estabilidade emocional e ausência de agitação excessiva diante das circunstâncias.' },
    { palavra: 'Conforto', titulo: 'Conforto', tipo: 'Sentimento', descricao: 'Sensação de bem-estar, proteção e acolhimento proporcionada por uma pessoa, ambiente, situação ou pensamento.' },
    { palavra: 'Deleite', titulo: 'Deleite', tipo: 'Sentimento', descricao: 'Prazer sereno e profundo experimentado diante de algo belo, agradável ou significativo.' },
    { palavra: 'Jubilo', titulo: 'Júbilo', tipo: 'Emoção', descricao: 'Alegria intensa e expansiva relacionada a uma conquista, celebração ou acontecimento de grande significado.' },
    { palavra: 'Felicidade', titulo: 'Felicidade', tipo: 'Sentimento', descricao: 'Estado positivo de bem-estar e satisfação relacionado à percepção de sentido, vínculos, realizações e experiências valorizadas.' },
    { palavra: 'Iniciativa', titulo: 'Iniciativa', tipo: 'Virtude', descricao: 'Disposição para agir espontaneamente diante de necessidades, oportunidades ou desafios, dando o primeiro passo com autonomia e responsabilidade, sem depender constantemente da orientação ou ação de outras pessoas. Disposição para colocar capacidades e recursos a serviço do bem das pessoas e da comunidade com responsabilidade e generosidade.' },
    { palavra: 'Estima', titulo: 'Estima', tipo: 'Sentimento', descricao: 'Sentimento de consideração e valorização por alguém, baseado no reconhecimento de suas qualidades, caráter ou importância.' },
    { palavra: 'Simpatia', titulo: 'Simpatia', tipo: 'Sentimento', descricao: 'Sentimento espontâneo de afinidade e receptividade que desperta agrado, proximidade e disposição positiva em relação a alguém.' },
    { palavra: 'Carinho', titulo: 'Carinho', tipo: 'Sentimento', descricao: 'Manifestação afetuosa de cuidado, atenção e proximidade, expressa por palavras, gestos ou atitudes que demonstram consideração pelo outro.' },
    { palavra: 'Bemquerer', titulo: 'Bem-querer', tipo: 'Sentimento', descricao: 'Sentimento sincero de desejar o bem, a felicidade e o desenvolvimento de outra pessoa, acompanhado de afeto e consideração.' },
    { palavra: 'Apreco', titulo: 'Apreço', tipo: 'Sentimento', descricao: 'Sentimento de valorização e consideração por alguém ou por algo reconhecido como importante, significativo ou digno de respeito.' },
    { palavra: 'Disposicao', titulo: 'Disposição', tipo: 'Virtude', descricao: 'Prontidão interior para agir, colaborar ou enfrentar uma tarefa ou situação com abertura, energia e boa vontade.' },
    { palavra: 'Atencao', titulo: 'Atenção', tipo: 'Virtude', descricao: 'Capacidade de direcionar conscientemente a percepção e o interesse para uma pessoa, atividade ou situação, procurando compreender e responder de maneira cuidadosa.' },
    { palavra: 'Motivacao', titulo: 'Motivação', tipo: 'Sentimento', descricao: 'Impulso interior que desperta, orienta e sustenta a vontade de agir em direção a uma necessidade, propósito ou objetivo.' },
    { palavra: 'Empenho', titulo: 'Empenho', tipo: 'Virtude', descricao: 'Disposição para aplicar esforço, energia e persistência na realização de uma tarefa ou na conquista de um objetivo.' },
    { palavra: 'Concentracao', titulo: 'Concentração', tipo: 'Virtude', descricao: 'Capacidade de manter a atenção direcionada a uma atividade, pensamento ou objetivo, reduzindo a influência de distrações.' },
    { palavra: 'Foco', titulo: 'Foco', tipo: 'Virtude', descricao: 'Capacidade de direcionar e sustentar esforços, atenção e prioridades naquilo que é relevante para alcançar determinado propósito.' },
    { palavra: 'Afinidade', titulo: 'Afinidade', tipo: 'Sentimento', descricao: 'Sensação de identificação, sintonia ou proximidade com alguém, ideia, atividade ou valor devido à existência de características ou interesses em comum.' },
    { palavra: 'Animo', titulo: 'Ânimo', tipo: 'Sentimento', descricao: 'Estado interior de energia, coragem e disposição que favorece a ação e ajuda a enfrentar tarefas, desafios e experiências da vida.' },
  ];

  const SIZE = 13;
  const WORDS_PER_GAME = 8;
  const DIRECTIONS = [
    { dr: 0, dc: 1 }, { dr: 1, dc: 0 }, { dr: 1, dc: 1 }, { dr: 1, dc: -1 },
    { dr: 0, dc: -1 }, { dr: -1, dc: 0 }, { dr: -1, dc: -1 }, { dr: -1, dc: 1 },
  ];

  const normalizeWord = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
  const normalizeEntry = (entry) => ({
    id: entry.id || S._uid(),
    palavra: normalizeWord(entry.palavra || entry.titulo || ''),
    titulo: (entry.titulo || entry.palavra || '').trim(),
    tipo: (entry.tipo || 'Virtude').trim(),
    descricao: (entry.descricao || '').trim(),
    ativo: entry.ativo !== false,
  });
  const defaultWords = () => DEFAULT_WORD_BANK.map(normalizeEntry);
  const getWordBank = (activeOnly = true) => {
    let words = S.getJogoPalavras();
    if (!words.length) {
      words = defaultWords();
      S.saveJogoPalavras(words);
    } else {
      words = words.map(normalizeEntry).filter(w => w.palavra && w.titulo);
      const existing = new Set(words.map(w => w.palavra));
      const missingDefaults = defaultWords().filter(w => !existing.has(w.palavra));
      if (missingDefaults.length) {
        words = [...words, ...missingDefaults];
        S.saveJogoPalavras(words);
      }
    }
    return activeOnly ? words.filter(w => w.ativo !== false) : words;
  };
  const restoreDefaultWords = () => S.saveJogoPalavras(defaultWords());
  const shuffle = (arr) => arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(v => v[1]);
  const randomLetter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));

  const canPlace = (grid, word, row, col, dir) => {
    for (let i = 0; i < word.length; i++) {
      const r = row + dir.dr * i;
      const c = col + dir.dc * i;
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return false;
      if (grid[r][c] && grid[r][c] !== word[i]) return false;
    }
    return true;
  };

  const placeWord = (grid, entry) => {
    const word = normalizeWord(entry.palavra);
    for (let attempt = 0; attempt < 150; attempt++) {
      const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      const row = Math.floor(Math.random() * SIZE);
      const col = Math.floor(Math.random() * SIZE);
      if (!canPlace(grid, word, row, col, dir)) continue;
      const cells = [];
      for (let i = 0; i < word.length; i++) {
        const r = row + dir.dr * i;
        const c = col + dir.dc * i;
        grid[r][c] = word[i];
        cells.push(`${r}-${c}`);
      }
      return { ...entry, word, cells, found: false };
    }
    return null;
  };

  const getLineCells = (row, col, dir, length) => {
    const cells = [];
    for (let i = 0; i < length; i++) {
      const r = row + dir.dr * i;
      const c = col + dir.dc * i;
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return null;
      cells.push(`${r}-${c}`);
    }
    return cells;
  };

  const countWordOccurrences = (grid, word) => {
    const normalized = normalizeWord(word);
    if (!normalized) return [];
    const found = [];
    const seen = new Set();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        DIRECTIONS.forEach(dir => {
          const cells = getLineCells(r, c, dir, normalized.length);
          if (!cells) return;
          const letters = cells.map(key => {
            const [rr, cc] = key.split('-').map(Number);
            return grid[rr]?.[cc] || '';
          }).join('');
          if (letters !== normalized) return;
          const key = cells.join('|');
          const reverseKey = [...cells].reverse().join('|');
          const canonical = key < reverseKey ? key : reverseKey;
          if (!seen.has(canonical)) {
            seen.add(canonical);
            found.push(cells);
          }
        });
      }
    }
    return found;
  };

  const hasSingleOccurrencePerWord = (grid, words) =>
    words.every(w => countWordOccurrences(grid, w.word || w.palavra).length === 1);

  const repairExtraOccurrences = (grid, words) => {
    const protectedCells = new Set(words.flatMap(w => w.cells || []));
    for (let attempt = 0; attempt < 800 && !hasSingleOccurrencePerWord(grid, words); attempt++) {
      const word = words.find(w => countWordOccurrences(grid, w.word || w.palavra).length > 1);
      if (!word) return;
      const official = (word.cells || []).join('|');
      const extra = countWordOccurrences(grid, word.word || word.palavra)
        .find(cells => cells.join('|') !== official && [...cells].reverse().join('|') !== official);
      const editable = extra?.find(cell => !protectedCells.has(cell));
      if (!editable) continue;
      const [r, c] = editable.split('-').map(Number);
      let next = grid[r][c];
      for (let tries = 0; tries < 12 && next === grid[r][c]; tries++) next = randomLetter();
      grid[r][c] = next;
    }
  };

  const getPreviousGameWords = (previousGame) => new Set((previousGame?.words || [])
    .map(w => normalizeWord(w.word || w.palavra || w.titulo || ''))
    .filter(Boolean));

  const getGameCandidates = (previousGame) => {
    const bank = getWordBank(true);
    const previousWords = getPreviousGameWords(previousGame);
    const fresh = bank.filter(entry => !previousWords.has(normalizeWord(entry.palavra || entry.titulo || '')));
    return fresh.length >= WORDS_PER_GAME
      ? fresh
      : [...fresh, ...bank.filter(entry => previousWords.has(normalizeWord(entry.palavra || entry.titulo || '')))];
  };

  const buildGameOnce = (previousGame = null) => {
    const grid = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => ''));
    const placed = [];
    shuffle(getGameCandidates(previousGame)).forEach(entry => {
      if (placed.length >= WORDS_PER_GAME) return;
      const item = placeWord(grid, entry);
      if (item) placed.push(item);
    });
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!grid[r][c]) grid[r][c] = randomLetter();
      }
    }
    repairExtraOccurrences(grid, placed);
    return { grid, words: placed, selected: null, message: 'Toque na primeira letra e depois na última letra da palavra.' };
  };

  const buildGame = (previousGame = null) => {
    let fallback = null;
    for (let attempt = 0; attempt < 120; attempt++) {
      const game = buildGameOnce(previousGame);
      if (!fallback || game.words.length > fallback.words.length) fallback = game;
      if (game.words.length === WORDS_PER_GAME && hasSingleOccurrencePerWord(game.grid, game.words)) return game;
    }
    return fallback;
  };

  const isValidGame = (game) => {
    if (!game || !Array.isArray(game.grid) || !Array.isArray(game.words)) return false;
    if (game.grid.length !== SIZE || game.grid.some(row => !Array.isArray(row) || row.length !== SIZE)) return false;
    return game.words.length > 0 && game.words.every(w =>
      w && Array.isArray(w.cells) && w.cells.length && typeof w.word === 'string' && typeof w.titulo === 'string'
    ) && hasSingleOccurrencePerWord(game.grid, game.words);
  };

  const loadSavedGame = () => {
    const saved = S.getJogoPalavrasEstado ? S.getJogoPalavrasEstado() : null;
    return isValidGame(saved) ? saved : buildGame();
  };

  const saveGame = (game) => {
    if (S.saveJogoPalavrasEstado && isValidGame(game)) S.saveJogoPalavrasEstado(game);
  };

  const cellsBetween = (start, end) => {
    const drRaw = end.r - start.r;
    const dcRaw = end.c - start.c;
    const steps = Math.max(Math.abs(drRaw), Math.abs(dcRaw));
    if (!steps) return [`${start.r}-${start.c}`];
    const dr = drRaw === 0 ? 0 : drRaw / Math.abs(drRaw);
    const dc = dcRaw === 0 ? 0 : dcRaw / Math.abs(dcRaw);
    if (!(drRaw === 0 || dcRaw === 0 || Math.abs(drRaw) === Math.abs(dcRaw))) return [];
    return Array.from({ length: steps + 1 }, (_, i) => `${start.r + dr * i}-${start.c + dc * i}`);
  };

  const showDefinition = (entry, onClose) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const close = () => {
      overlay.remove();
      if (typeof onClose === 'function') onClose();
    };
    overlay.innerHTML = `
      <div class="modal word-modal">
        <div class="word-modal-kind">${H.esc(entry.tipo)}</div>
        <h3>${H.esc(entry.titulo)}</h3>
        <p>${H.esc(entry.descricao)}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-primary" id="word-continue">Continuar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#word-continue').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
  };

  const showCompletion = (onNewGame) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal word-modal">
        <div class="word-modal-kind">Partida concluída</div>
        <h3>Parabéns, você encontrou todas as palavras!</h3>
        <p>Agora vale uma pausa: quais virtudes você quer cultivar mais de perto? Quais sentimentos deseja fortalecer e quais emoções quer compreender melhor nos próximos dias?</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="word-close">Fechar</button>
          <button type="button" class="btn btn-primary" id="word-new-game">Novo jogo</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#word-close').onclick = () => overlay.remove();
    overlay.querySelector('#word-new-game').onclick = () => { overlay.remove(); onNewGame(); };
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  };

  PCF.Pages.cacaPalavras = (container) => {
    let game = loadSavedGame();
    saveGame(game);

    const render = () => {
      const foundCount = game.words.filter(w => w.found).length;
      container.innerHTML = `
        <div class="page word-game-page">
          <div class="page-header word-game-header">
            <div>
              <h2>✨ Caça-Palavras Interior</h2>
              <p class="subtitle">Encontre bons sentimentos, emoções e virtudes. Ao descobrir uma palavra, reflita sobre sua definição.</p>
            </div>
            <button type="button" class="btn btn-primary" id="wg-new"><i data-lucide="refresh-cw"></i> Novo jogo</button>
          </div>

          <div class="word-game-intro">
            <div class="word-game-intro-icon">🔎</div>
            <div>
              <strong>Como jogar</strong>
              <span>Toque na primeira letra da palavra e depois na última. Vale horizontal, vertical e diagonal.</span>
            </div>
          </div>

          <div class="word-game-summary">
            <div class="word-game-score"><strong>${foundCount}</strong><span>de ${game.words.length} encontradas</span></div>
            <div class="word-game-progress"><span style="width:${game.words.length ? (foundCount / game.words.length) * 100 : 0}%"></span></div>
          </div>

          <div class="word-game-layout">
            <section class="word-board-card">
              <div class="word-board" aria-label="Tabuleiro do caça-palavras">
                ${game.grid.map((row, r) => row.map((letter, c) => {
                  const key = `${r}-${c}`;
                  const found = game.words.some(w => w.found && w.cells.includes(key));
                  const selected = game.selected === key;
                  return `<button type="button" class="word-cell ${found ? 'found' : ''} ${selected ? 'selected' : ''}" data-r="${r}" data-c="${c}">${letter}</button>`;
                }).join('')).join('')}
              </div>
              <p class="word-game-tip">${H.esc(game.message)}</p>
            </section>

            <aside class="word-list-card">
              <h3>Palavras da rodada</h3>
              <div class="word-list">
                ${game.words.map(w => `<div class="word-token ${w.found ? 'found' : ''}"><span>${H.esc(w.titulo)}</span><small>${H.esc(w.tipo)}</small></div>`).join('')}
              </div>
            </aside>
          </div>
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.App.applyStandardHeader?.(container, '#caca-palavras');

      container.querySelector('#wg-new').onclick = () => {
        game = buildGame(game);
        saveGame(game);
        render();
      };

      container.querySelectorAll('.word-cell').forEach(btn => {
        btn.onclick = () => {
          const point = { r: Number(btn.dataset.r), c: Number(btn.dataset.c) };
          const key = `${point.r}-${point.c}`;
          if (!game.selected) {
            game.selected = key;
            game.message = 'Agora toque na última letra da palavra.';
            saveGame(game);
            render();
            return;
          }

          const [sr, sc] = game.selected.split('-').map(Number);
          const cells = cellsBetween({ r: sr, c: sc }, point);
          const reverse = [...cells].reverse();
          const found = game.words.find(w => !w.found && (w.cells.join('|') === cells.join('|') || w.cells.join('|') === reverse.join('|')));
          game.selected = null;

          if (found) {
            found.found = true;
            game.message = `Você encontrou ${found.titulo}.`;
            saveGame(game);
            render();
            const completed = game.words.every(w => w.found);
            if (completed) S.addJogoHistorico?.({ jogo: 'caca-palavras', pontos: game.words.length, total: game.words.length });
            showDefinition(found, completed ? () => {
              showCompletion(() => {
                game = buildGame(game);
                saveGame(game);
                render();
              });
            } : null);
          } else {
            game.message = 'Ainda não foi dessa vez. Escolha a primeira letra e tente novamente.';
            saveGame(game);
            render();
          }
        };
      });
    };

    render();
  };

  PCF.Pages.cacaPalavrasBase = (container) => {
    let filtro = '';

    const render = () => {
      const all = getWordBank(false);
      const filtered = filtro ? all.filter(item => {
        const haystack = `${item.titulo} ${item.tipo} ${item.descricao}`.toLowerCase();
        return haystack.includes(filtro.toLowerCase());
      }) : all;

      container.innerHTML = `
        <div class="page word-base-page">
          <div class="page-header word-base-header">
            <div>
              <h2><i data-lucide="database"></i> Base do Caça-Palavras <span class="title-count-badge">${all.length}</span></h2>
              <p class="subtitle">Gerencie as palavras, tipos e definições usadas no jogo.</p>
            </div>
            <div class="page-header-actions">
              <a href="#caca-palavras" class="btn btn-secondary btn-sm"><i data-lucide="puzzle"></i> Jogar</a>
              <button type="button" class="btn btn-outline btn-sm" id="wb-restore"><i data-lucide="rotate-ccw"></i> Restaurar padrões</button>
              <button type="button" class="btn btn-primary btn-sm" id="wb-new"><i data-lucide="plus"></i> Nova palavra</button>
            </div>
          </div>

          <div class="base-toolbar word-base-toolbar">
            <input type="search" id="wb-search" class="form-control" placeholder="Buscar palavra, tipo ou definição" value="${H.esc(filtro)}">
            <span class="badge badge-neutral">${filtered.length} exibida${filtered.length !== 1 ? 's' : ''}</span>
          </div>

          <div class="table-container word-base-table-wrap">
            <table class="data-table word-base-table">
              <thead>
                <tr>
                  <th>Palavra</th>
                  <th>Tipo</th>
                  <th>Definição</th>
                  <th>Ativa</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length ? filtered.map(item => `
                  <tr class="${item.ativo === false ? 'row-inactive' : ''}">
                    <td><strong>${H.esc(item.titulo)}</strong><small>${H.esc(item.palavra)}</small></td>
                    <td><span class="badge badge-neutral">${H.esc(item.tipo)}</span></td>
                    <td class="text-muted">${H.esc(item.descricao)}</td>
                    <td><input type="checkbox" data-wb-active="${H.esc(item.id)}" ${item.ativo !== false ? 'checked' : ''}></td>
                    <td class="actions-cell">
                      <button type="button" class="btn btn-icon btn-ghost" data-wb-edit="${H.esc(item.id)}" title="Editar"><i data-lucide="pencil"></i></button>
                      <button type="button" class="btn btn-icon btn-danger" data-wb-del="${H.esc(item.id)}" title="Excluir"><i data-lucide="trash-2"></i></button>
                    </td>
                  </tr>`).join('') : '<tr><td colspan="5" class="empty-text">Nenhuma palavra encontrada.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.App.applyStandardHeader?.(container, '#caca-palavras-base');

      container.querySelector('#wb-search').oninput = (e) => {
        filtro = e.target.value.trim();
        render();
      };
      container.querySelector('#wb-new').onclick = () => openWordModal(null);
      container.querySelector('#wb-restore').onclick = () => {
        if (!confirm('Restaurar a base padrão do Caça-Palavras? As alterações atuais serão substituídas.')) return;
        restoreDefaultWords();
        render();
      };
      container.querySelectorAll('[data-wb-edit]').forEach(btn => {
        btn.onclick = () => openWordModal(all.find(item => item.id === btn.dataset.wbEdit));
      });
      container.querySelectorAll('[data-wb-del]').forEach(btn => {
        btn.onclick = () => {
          if (!confirm('Excluir esta palavra do jogo?')) return;
          S.deleteJogoPalavra(btn.dataset.wbDel);
          render();
        };
      });
      container.querySelectorAll('[data-wb-active]').forEach(chk => {
        chk.onchange = () => {
          S.updateJogoPalavra(chk.dataset.wbActive, { ativo: chk.checked });
          render();
        };
      });
    };

    const openWordModal = (item) => {
      const isEdit = !!item;
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal modal-md word-edit-modal">
          <h3><i data-lucide="${isEdit ? 'pencil' : 'plus-circle'}"></i> ${isEdit ? 'Editar' : 'Nova'} palavra</h3>
          <form id="wb-form">
            <div class="form-row">
              <div class="form-group">
                <label>Palavra *</label>
                <input type="text" id="wb-title" class="form-control" value="${H.esc(item?.titulo || '')}" maxlength="24" required>
              </div>
              <div class="form-group">
                <label>Tipo</label>
                <select id="wb-type" class="form-control">
                  ${['Virtude', 'Sentimento', 'Emoção'].map(type => `<option value="${type}" ${item?.tipo === type ? 'selected' : ''}>${type}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Definição / descrição *</label>
              <textarea id="wb-description" class="form-control" rows="4" maxlength="420" required>${H.esc(item?.descricao || '')}</textarea>
            </div>
            <label class="check-label"><input type="checkbox" id="wb-active" ${item?.ativo === false ? '' : 'checked'}> Palavra ativa no jogo</label>
            <div id="wb-error" class="alert alert-error" style="display:none"></div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" id="wb-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">Salvar</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(overlay);
      if (window.lucide) lucide.createIcons();

      const close = () => overlay.remove();
      overlay.onclick = (e) => { if (e.target === overlay) close(); };
      overlay.querySelector('#wb-cancel').onclick = close;
      overlay.querySelector('#wb-form').onsubmit = (e) => {
        e.preventDefault();
        const titulo = overlay.querySelector('#wb-title').value.trim();
        const descricao = overlay.querySelector('#wb-description').value.trim();
        const errEl = overlay.querySelector('#wb-error');
        const palavra = normalizeWord(titulo);
        if (!titulo || !palavra) { errEl.textContent = 'Informe uma palavra válida.'; errEl.style.display = 'block'; return; }
        if (palavra.length > SIZE) { errEl.textContent = `Use uma palavra com até ${SIZE} letras para caber no tabuleiro.`; errEl.style.display = 'block'; return; }
        if (!descricao) { errEl.textContent = 'Informe a definição da palavra.'; errEl.style.display = 'block'; return; }
        const data = {
          palavra,
          titulo,
          tipo: overlay.querySelector('#wb-type').value,
          descricao,
          ativo: overlay.querySelector('#wb-active').checked,
        };
        if (isEdit) S.updateJogoPalavra(item.id, data);
        else S.addJogoPalavra(data);
        close();
        render();
      };
    };

    render();
  };

  /* ==================== JOGOS DE APRENDIZADO ==================== */
  const JOGOS_TAB_KEY = 'pcf_jogos_aprendizado_tab';
  const MEMORY_PAIRS = 6;
  const QUIZ_QUESTIONS = 8;
  const QUIZ_OPTIONS = 4;

  const readTab = () => { try { return localStorage.getItem(JOGOS_TAB_KEY) || 'memoria'; } catch (_) { return 'memoria'; } };
  const writeTab = (tab) => { try { localStorage.setItem(JOGOS_TAB_KEY, tab); } catch (_) {} };

  const uniqueByTitle = (entries) => {
    const seen = new Set();
    return entries.filter(e => {
      const key = normalizeWord(e.titulo);
      if (!key || seen.has(key) || !e.descricao) return false;
      seen.add(key);
      return true;
    });
  };

  // Primeira frase da definição, cortada para caber na carta.
  const shortDefinition = (text, max = 100) => {
    const first = String(text || '').split(/\.\s/)[0].replace(/\.$/, '');
    return first.length <= max ? first : `${first.slice(0, max).replace(/\s+\S*$/, '')}…`;
  };

  // Esconde a própria palavra quando ela aparece na definição.
  const maskTitle = (text, titulo) => {
    const base = String(titulo || '').split('(')[0].trim();
    if (!base) return text;
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(text || '').replace(new RegExp(escaped, 'gi'), '_____');
  };

  const recentGamesSummary = () => {
    const hist = S.getJogosHistorico ? S.getJogosHistorico() : [];
    const cut = new Date(); cut.setDate(cut.getDate() - 30);
    const cutStr = cut.toISOString().split('T')[0];
    const recent = hist.filter(j => j.data >= cutStr);
    return { partidas: recent.length, dias: new Set(recent.map(j => j.data)).size };
  };

  const showGameResult = ({ kind, title, text, items = [], onNewGame }) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal word-modal">
        <div class="word-modal-kind">${H.esc(kind)}</div>
        <h3>${H.esc(title)}</h3>
        <p>${H.esc(text)}</p>
        ${items.length ? `<div class="lg-result-list">${items.map(i => `<span class="badge badge-neutral">${H.esc(i)}</span>`).join('')}</div>` : ''}
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="lg-close">Fechar</button>
          <button type="button" class="btn btn-primary" id="lg-new">Jogar novamente</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#lg-close').onclick = close;
    overlay.querySelector('#lg-new').onclick = () => { close(); onNewGame(); };
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
  };

  /* ---------- Memória das Virtudes: palavra ↔ definição ---------- */
  const buildMemoryGame = () => {
    const bank = uniqueByTitle(shuffle(getWordBank(true)));
    const preferred = bank.filter(e => shortDefinition(e.descricao).length <= 90);
    const chosen = [...preferred, ...bank.filter(e => !preferred.includes(e))].slice(0, MEMORY_PAIRS);
    const cards = shuffle(chosen.flatMap((entry, pairId) => ([
      { pairId, face: 'palavra', text: entry.titulo, tipo: entry.tipo },
      { pairId, face: 'definicao', text: shortDefinition(maskTitle(entry.descricao, entry.titulo)), tipo: entry.tipo },
    ])));
    return { entries: chosen, cards, flipped: [], matched: [], moves: 0, locked: false, done: false };
  };

  const memoryStars = (moves, pairs) => (moves <= pairs + 3 ? 3 : moves <= pairs * 2 + 2 ? 2 : 1);

  const renderMemory = (area, onPlayed) => {
    let game = buildMemoryGame();
    let unflipTimer = null;

    const render = () => {
      clearTimeout(unflipTimer);
      const pairs = game.entries.length;
      if (!pairs) {
        area.innerHTML = '<p class="empty-text">Cadastre palavras na Base do Caça-Palavras para jogar a memória.</p>';
        return;
      }
      area.innerHTML = `
        <div class="word-game-intro">
          <div class="word-game-intro-icon">🧠</div>
          <div>
            <strong>Memória das Virtudes</strong>
            <span>Vire duas cartas por vez e forme o par entre a <b>palavra</b> e a sua <b>definição</b>. Cada par encontrado revela um conceito para refletir.</span>
          </div>
        </div>
        <div class="word-game-summary">
          <div class="word-game-score"><strong id="mem-found">${game.matched.length}</strong><span>de ${pairs} pares · <b id="mem-moves">${game.moves}</b> jogadas</span></div>
          <div class="word-game-progress"><span id="mem-progress" style="width:${(game.matched.length / pairs) * 100}%"></span></div>
        </div>
        <div class="word-game-layout">
          <section class="word-board-card">
            <div class="mem-board" aria-label="Tabuleiro do jogo da memória">
              ${game.cards.map((card, i) => `
                <button type="button" class="mem-card mem-${card.face}" data-i="${i}" aria-label="Carta ${i + 1}">
                  <span class="mem-card-inner">
                    <span class="mem-face mem-back" aria-hidden="true">✨</span>
                    <span class="mem-face mem-front">
                      <small>${card.face === 'palavra' ? H.esc(card.tipo) : 'Definição'}</small>
                      <span>${H.esc(card.text)}</span>
                    </span>
                  </span>
                </button>`).join('')}
            </div>
            <p class="word-game-tip" id="mem-tip">Encontre os ${pairs} pares.</p>
          </section>
          <aside class="word-list-card">
            <h3>Aprendizados da rodada</h3>
            <div class="word-list" id="mem-learned"></div>
          </aside>
        </div>`;
      area.querySelectorAll('.mem-card').forEach(btn => { btn.onclick = () => flip(Number(btn.dataset.i)); });
      paintLearned();
    };

    const paintLearned = () => {
      const list = area.querySelector('#mem-learned');
      if (!list) return;
      list.innerHTML = game.matched.length
        ? game.matched.map(pairId => {
            const e = game.entries[pairId];
            return `<div class="word-token found lg-learned"><div><span>${H.esc(e.titulo)}</span><p>${H.esc(e.descricao)}</p></div><small>${H.esc(e.tipo)}</small></div>`;
          }).join('')
        : '<p class="text-muted">Os pares encontrados aparecem aqui com a definição completa.</p>';
    };

    const cardEl = (i) => area.querySelector(`.mem-card[data-i="${i}"]`);
    const setTip = (msg) => { const el = area.querySelector('#mem-tip'); if (el) el.textContent = msg; };
    const paintStats = () => {
      const pairs = game.entries.length;
      area.querySelector('#mem-found').textContent = game.matched.length;
      area.querySelector('#mem-moves').textContent = game.moves;
      area.querySelector('#mem-progress').style.width = `${(game.matched.length / pairs) * 100}%`;
    };

    const flip = (i) => {
      const card = game.cards[i];
      if (game.locked || game.done || game.flipped.includes(i) || game.matched.includes(card.pairId)) return;
      game.flipped.push(i);
      cardEl(i)?.classList.add('flipped');
      if (game.flipped.length < 2) { setTip('Agora escolha a carta que completa o par.'); return; }

      game.moves++;
      const [a, b] = game.flipped.map(idx => game.cards[idx]);
      if (a.pairId === b.pairId) {
        game.matched.push(a.pairId);
        game.flipped.forEach(idx => cardEl(idx)?.classList.add('matched'));
        game.flipped = [];
        paintStats();
        paintLearned();
        setTip(`Muito bem! Você formou o par de ${game.entries[a.pairId].titulo}.`);
        if (game.matched.length === game.entries.length) finish();
        return;
      }

      game.locked = true;
      paintStats();
      setTip('Ainda não formam um par. Observe bem e tente de novo.');
      const current = game;
      unflipTimer = setTimeout(() => {
        current.flipped.forEach(idx => cardEl(idx)?.classList.remove('flipped'));
        current.flipped = [];
        current.locked = false;
      }, 1100);
    };

    const finish = () => {
      game.done = true;
      const pairs = game.entries.length;
      const stars = memoryStars(game.moves, pairs);
      S.addJogoHistorico?.({ jogo: 'memoria', pontos: pairs, total: pairs, jogadas: game.moves, estrelas: stars });
      onPlayed();
      setTimeout(() => showGameResult({
        kind: `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} · ${game.moves} jogadas`,
        title: 'Parabéns, você completou a memória!',
        text: 'Escolha uma das palavras abaixo e pense em uma atitude concreta para praticá-la hoje.',
        items: game.entries.map(e => e.titulo),
        onNewGame: () => { game = buildMemoryGame(); render(); },
      }), 450);
    };

    render();
    return () => { game = buildMemoryGame(); render(); };
  };

  /* ---------- Quiz das Definições: qual palavra corresponde? ---------- */
  const buildQuiz = () => {
    const bank = uniqueByTitle(getWordBank(true));
    const chosen = shuffle(bank).slice(0, QUIZ_QUESTIONS);
    const questions = chosen.map(entry => {
      const sameType = shuffle(bank.filter(e => e.titulo !== entry.titulo && e.tipo === entry.tipo));
      const others = shuffle(bank.filter(e => e.titulo !== entry.titulo && e.tipo !== entry.tipo));
      const distractors = [...sameType, ...others].slice(0, QUIZ_OPTIONS - 1).map(e => e.titulo);
      return {
        entry,
        prompt: maskTitle(entry.descricao, entry.titulo),
        options: shuffle([entry.titulo, ...distractors]),
      };
    });
    return { questions, index: 0, score: 0, streak: 0, bestStreak: 0, answered: null, missed: [] };
  };

  const renderQuiz = (area, onPlayed) => {
    let quiz = buildQuiz();

    const render = () => {
      const total = quiz.questions.length;
      if (!total) {
        area.innerHTML = '<p class="empty-text">Cadastre palavras na Base do Caça-Palavras para jogar o quiz.</p>';
        return;
      }
      const q = quiz.questions[quiz.index];
      const answered = quiz.answered !== null;
      const correct = answered && quiz.answered === q.entry.titulo;
      area.innerHTML = `
        <div class="word-game-intro">
          <div class="word-game-intro-icon">💡</div>
          <div>
            <strong>Quiz das Definições</strong>
            <span>Leia a definição e escolha a virtude, sentimento ou emoção correspondente. Acertos seguidos formam uma sequência!</span>
          </div>
        </div>
        <div class="word-game-summary">
          <div class="word-game-score"><strong>${quiz.score}</strong><span>acerto${quiz.score === 1 ? '' : 's'} · pergunta ${quiz.index + 1} de ${total}${quiz.streak > 1 ? ` · 🔥 ${quiz.streak} seguidos` : ''}</span></div>
          <div class="word-game-progress"><span style="width:${((quiz.index + (answered ? 1 : 0)) / total) * 100}%"></span></div>
        </div>
        <section class="word-board-card quiz-card">
          <div class="word-modal-kind">Definição · ${H.esc(q.entry.tipo)}</div>
          <p class="quiz-prompt">“${H.esc(q.prompt)}”</p>
          <div class="quiz-options">
            ${q.options.map((opt, i) => {
              let cls = '';
              if (answered && opt === q.entry.titulo) cls = 'correct';
              else if (answered && opt === quiz.answered) cls = 'wrong';
              return `<button type="button" class="quiz-option ${cls}" data-opt="${i}" ${answered ? 'disabled' : ''}>${H.esc(opt)}</button>`;
            }).join('')}
          </div>
          ${answered ? `
            <div class="quiz-feedback ${correct ? 'ok' : 'nok'}">
              <strong>${correct ? 'Correto! 🎉' : `A resposta era ${H.esc(q.entry.titulo)}.`}</strong>
              <span>${H.esc(q.entry.descricao)}</span>
            </div>
            <div class="quiz-next">
              <button type="button" class="btn btn-primary" id="quiz-next">${quiz.index + 1 < total ? 'Próxima pergunta' : 'Ver resultado'} <i data-lucide="arrow-right"></i></button>
            </div>` : ''}
        </section>`;
      if (window.lucide) lucide.createIcons();

      area.querySelectorAll('.quiz-option').forEach(btn => {
        btn.onclick = () => {
          if (quiz.answered !== null) return;
          quiz.answered = q.options[Number(btn.dataset.opt)];
          if (quiz.answered === q.entry.titulo) {
            quiz.score++;
            quiz.streak++;
            quiz.bestStreak = Math.max(quiz.bestStreak, quiz.streak);
          } else {
            quiz.streak = 0;
            quiz.missed.push(q.entry.titulo);
          }
          render();
        };
      });
      const next = area.querySelector('#quiz-next');
      if (next) next.onclick = () => {
        if (quiz.index + 1 < total) { quiz.index++; quiz.answered = null; render(); return; }
        finish();
      };
    };

    const finish = () => {
      const total = quiz.questions.length;
      S.addJogoHistorico?.({ jogo: 'quiz', pontos: quiz.score, total, melhorSequencia: quiz.bestStreak });
      onPlayed();
      const pct = quiz.score / total;
      const title = pct === 1 ? 'Gabaritou! Que conhecimento!' : pct >= 0.6 ? 'Muito bem, ótimo resultado!' : 'Bom começo, continue praticando!';
      const restartQuiz = () => { quiz = buildQuiz(); render(); };
      showGameResult({
        kind: `${quiz.score} de ${total} · melhor sequência ${quiz.bestStreak}`,
        title,
        text: quiz.missed.length
          ? 'Vale revisar com carinho as palavras abaixo — conhecer bem um conceito ajuda a praticá-lo no dia a dia.'
          : 'Você reconheceu todos os conceitos. Que tal escolher um deles para colocar em prática hoje?',
        items: quiz.missed.length ? quiz.missed : quiz.questions.map(item => item.entry.titulo),
        onNewGame: restartQuiz,
      });
      restartQuiz();
    };

    render();
    return () => { quiz = buildQuiz(); render(); };
  };

  const LEARNING_GAMES = [
    { id: 'memoria', icon: 'brain', label: 'Memória das Virtudes', mount: renderMemory },
    { id: 'quiz', icon: 'lightbulb', label: 'Quiz das Definições', mount: renderQuiz },
  ];

  PCF.Pages.jogosAprendizado = (container) => {
    let tab = LEARNING_GAMES.some(g => g.id === readTab()) ? readTab() : LEARNING_GAMES[0].id;
    let restart = null;

    const paintSummary = () => {
      const el = container.querySelector('#lg-summary');
      if (!el) return;
      const { partidas, dias } = recentGamesSummary();
      el.innerHTML = `<i data-lucide="target"></i> <span>${partidas} partida${partidas === 1 ? '' : 's'} em ${dias} dia${dias === 1 ? '' : 's'} nos últimos 30 dias — seus jogos ajudam a pré-preencher a área <b>Lazer</b> da Roda da Vida.</span>`;
      if (window.lucide) lucide.createIcons();
    };

    const render = () => {
      container.innerHTML = `
        <div class="page word-game-page learning-games-page">
          <div class="page-header word-game-header">
            <div>
              <h2>🎮 Jogos de Aprendizado</h2>
              <p class="subtitle">Exercite a memória e o conhecimento sobre virtudes, sentimentos e emoções.</p>
            </div>
            <button type="button" class="btn btn-primary" id="lg-restart"><i data-lucide="refresh-cw"></i> Novo jogo</button>
          </div>
          <div class="lg-switch" role="tablist" aria-label="Escolha o jogo">
            ${LEARNING_GAMES.map(g => `
              <button type="button" role="tab" class="lg-switch-btn${g.id === tab ? ' active' : ''}" data-game="${g.id}" aria-selected="${g.id === tab}">
                <i data-lucide="${g.icon}"></i> ${g.label}
              </button>`).join('')}
          </div>
          <div id="lg-area"></div>
          <p class="lg-summary" id="lg-summary"></p>
        </div>`;

      if (window.lucide) lucide.createIcons();
      PCF.App.applyStandardHeader?.(container, '#jogos-aprendizado');

      const game = LEARNING_GAMES.find(g => g.id === tab);
      restart = game.mount(container.querySelector('#lg-area'), paintSummary);
      paintSummary();

      container.querySelector('#lg-restart').onclick = () => restart?.();
      container.querySelectorAll('.lg-switch-btn').forEach(btn => {
        btn.onclick = () => {
          if (btn.dataset.game === tab) return;
          tab = btn.dataset.game;
          writeTab(tab);
          render();
        };
      });
    };

    render();
  };
})();
